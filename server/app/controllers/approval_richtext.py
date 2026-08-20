"""Server-side handling of the rich "Purpose of Approval" field.

The Create-NFA box lets the user paste a range straight out of Excel, so the
stored value can be an HTML fragment (a <table> with the cell formatting inlined)
instead of plain text.

Two jobs live here:

1. ``sanitize_rich_html`` — the browser sanitizes before sending, but the API is
   reachable without the browser, so the same allow-list is enforced again here.
   That matters because the stored value is injected into the result email and
   into other users' pages. Nothing outside the allow-list survives: no script,
   style block, event handler, or URL-bearing attribute.
2. ``html_to_text`` / ``html_flowables`` — the same value has to come out as
   plain text (subjects, logs) and as reportlab flowables (the PDF export), where
   a raw <table> tag would otherwise blow up Paragraph parsing.
"""

import re
from html import escape as _escape
from html.parser import HTMLParser

ALLOWED_TAGS = {
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "p", "div", "br", "hr", "span", "font",
    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "small", "mark",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code",
}
# dropped together with everything inside them
DROP_TAGS = {"script", "style", "head", "meta", "link", "title", "iframe",
             "object", "embed", "form", "input", "button"}
VOID_TAGS = {"br", "hr", "col"}
ALLOWED_ATTRS = {"td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}}

ALLOWED_STYLE_PROPS = {
    "color", "background-color", "background", "font-weight", "font-style", "font-size",
    "font-family", "text-align", "text-decoration", "vertical-align", "white-space",
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-color", "border-style", "border-width", "border-collapse",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "width", "height", "min-width",
}
_UNSAFE_VALUE = ("url(", "expression(", "javascript:", "@import", "behavior:", "behaviour:")

BLOCK_TAGS = {"p", "div", "li", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "pre"}


def is_rich_html(value) -> bool:
    """True when the stored value carries markup (a legacy purpose is plain text)."""
    s = str(value or "").lower()
    return any(f"<{t}" in s for t in
               ("table", "tr", "td", "th", "p ", "p>", "div", "br", "ul", "ol", "li",
                "span", "b>", "strong", "i>", "em", "u>", "h1", "h2", "h3"))


def has_table(value) -> bool:
    """True only for a value carrying a real pasted grid — bold/line-break-only
    markup does not need the full-width treatment in the mail or the PDF."""
    return "<table" in str(value or "").lower()


def _clean_style(style_text: str) -> str:
    out = []
    for decl in str(style_text or "").split(";"):
        if ":" not in decl:
            continue
        prop, _, val = decl.partition(":")
        prop = prop.strip().lower()
        val = val.strip()
        low = val.lower()
        if not val or prop not in ALLOWED_STYLE_PROPS:
            continue
        if any(bad in low for bad in _UNSAFE_VALUE):
            continue
        out.append(f"{prop}:{val}")
    return ";".join(out)


class _Sanitizer(HTMLParser):
    """Rebuilds the fragment from the allow-list; unknown tags are unwrapped
    (their text is kept), DROP_TAGS are discarded with their contents."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open_stack = []      # allowed tags currently open, for closing
        self.drop_depth = 0       # >0 while inside a DROP_TAGS element

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.drop_depth:
            if tag in DROP_TAGS:
                self.drop_depth += 1
            return
        if tag in DROP_TAGS:
            self.drop_depth = 1
            return
        if tag not in ALLOWED_TAGS:
            return                # unwrap — the inner text still comes through
        parts = [tag]
        d = dict((k.lower(), v or "") for k, v in attrs)
        for a in ALLOWED_ATTRS.get(tag, ()):  # colspan / rowspan only
            v = d.get(a, "").strip()
            if v.isdigit() and len(v) <= 3:
                parts.append(f'{a}="{v}"')
        style = _clean_style(d.get("style", ""))
        if tag == "table" and "border-collapse" not in style:
            style = (style + ";" if style else "") + "border-collapse:collapse"
        if style:
            parts.append(f'style="{_escape(style, quote=True)}"')
        if tag in VOID_TAGS:
            self.out.append(f"<{' '.join(parts)}>")
        else:
            self.out.append(f"<{' '.join(parts)}>")
            self.open_stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag.lower() in VOID_TAGS:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.drop_depth:
            if tag in DROP_TAGS:
                self.drop_depth -= 1
            return
        if tag in VOID_TAGS or tag not in ALLOWED_TAGS:
            return
        if tag in self.open_stack:
            # close anything left open inside it, so the markup stays balanced
            while self.open_stack:
                t = self.open_stack.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        if not self.drop_depth:
            self.out.append(_escape(data, quote=False))

    def result(self) -> str:
        while self.open_stack:
            self.out.append(f"</{self.open_stack.pop()}>")
        return "".join(self.out).strip()


def sanitize_rich_html(value):
    """Plain text passes through untouched; markup is rebuilt from the allow-list."""
    s = str(value or "").strip()
    if not s or not is_rich_html(s):
        return s
    p = _Sanitizer()
    p.feed(s)
    p.close()
    return p.result()


_CELL_RE = re.compile(r"<(td|th)\b([^>]*)>", re.I)


def inline_table_borders(html: str) -> str:
    """Email clients ignore <style> blocks, so every cell needs its gridline
    written on the element. Cells that already carry a border keep theirs."""
    default = "border:1px solid #d1d5db;padding:2px 6px"

    def fix(m):
        tag, attrs = m.group(1), m.group(2)
        if "border" in attrs.lower():
            return m.group(0)
        if 'style="' in attrs:
            attrs = re.sub(r'style="([^"]*)"',
                           lambda s: f'style="{s.group(1)};{default}"', attrs, count=1)
            return f"<{tag}{attrs}>"
        return f'<{tag}{attrs} style="{default}">'

    return _CELL_RE.sub(fix, html or "")


class _TextExtract(HTMLParser):
    """Markup -> readable plain text (cells tab-separated, rows on their own line)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.buf = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "br":
            self.buf.append("\n")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("td", "th"):
            self.buf.append("\t")
        elif tag in BLOCK_TAGS:
            self.buf.append("\n")

    def handle_data(self, data):
        self.buf.append(data)


def html_to_text(value) -> str:
    s = str(value or "")
    if not s or not is_rich_html(s):
        return s.strip()
    p = _TextExtract()
    p.feed(s)
    p.close()
    text = "".join(p.buf).replace("\xa0", " ")
    lines = [ln.strip().strip("\t").replace("\t", " | ") for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln).strip()


# ---------------- PDF rendering ---------------- #

class _TreeParser(HTMLParser):
    """Minimal DOM: every node is {'tag', 'attrs', 'kids'} or a str."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "root", "attrs": {}, "kids": []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in VOID_TAGS:
            self.stack[-1]["kids"].append({"tag": tag, "attrs": dict(attrs), "kids": []})
            return
        node = {"tag": tag, "attrs": dict((k.lower(), v or "") for k, v in attrs), "kids": []}
        self.stack[-1]["kids"].append(node)
        self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1]["kids"].append({"tag": tag.lower(), "attrs": dict(attrs), "kids": []})

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in VOID_TAGS:
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1]["kids"].append(data)


# reportlab's Paragraph understands only this handful of inline tags
_RL_INLINE = {"b": "b", "strong": "b", "i": "i", "em": "i", "u": "u",
              "sub": "sub", "sup": "super", "s": "strike", "strike": "strike"}


def _inline_markup(node) -> str:
    """Node subtree -> a string Paragraph can parse (escaped + inline tags)."""
    if isinstance(node, str):
        return _escape(node, quote=False)
    out = []
    tag = node["tag"]
    for kid in node["kids"]:
        out.append(_inline_markup(kid))
    inner = "".join(out)
    if tag == "br":
        return "<br/>"
    rl = _RL_INLINE.get(tag)
    if rl:
        return f"<{rl}>{inner}</{rl}>"
    # A cell reached here only as a last resort (a table nested inside another
    # cell). Separate the values anyway — never run them together.
    if tag in ("td", "th") and inner.strip():
        return inner.strip() + "  "
    if tag == "tr" and inner.strip():
        return inner.rstrip() + "<br/>"
    if tag in ("p", "div", "li") and inner.strip():
        return inner + "<br/>"
    # a bold cell keeps its weight when Excel wrote it as a style
    if "bold" in str(node["attrs"].get("style", "")).lower() and inner.strip():
        return f"<b>{inner}</b>"
    return inner


def _contains_table(node) -> bool:
    """Is there a <table> anywhere below this node?"""
    if isinstance(node, str):
        return False
    if node["tag"] == "table":
        return True
    return any(_contains_table(k) for k in node["kids"])


def _node_text(node) -> str:
    """Plain text of a subtree — used to size the PDF columns by content."""
    if isinstance(node, str):
        return node
    if node["tag"] == "br":
        return "\n"
    return "".join(_node_text(k) for k in node["kids"])


def _para(node, style):
    from reportlab.platypus import Paragraph
    txt = _inline_markup(node).strip()
    txt = txt.replace("\xa0", " ")
    while txt.endswith("<br/>"):
        txt = txt[:-5].rstrip()
    return Paragraph(txt or "&nbsp;", style)


def _find_rows(node, out):
    """Collect <tr> nodes in document order (thead/tbody wrappers included)."""
    for kid in node["kids"]:
        if isinstance(kid, str):
            continue
        if kid["tag"] == "tr":
            out.append(kid)
        elif kid["tag"] in ("thead", "tbody", "tfoot"):
            _find_rows(kid, out)
    return out


def _table_flowable(node, style, avail_width):
    """<table> subtree -> a reportlab Table honouring colspan / rowspan."""
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    rows = _find_rows(node, [])
    if not rows:
        return None

    grid = []          # grid[r][c] = flowable | None (covered by a span)
    spans = []         # ("SPAN", (c0,r0), (c1,r1))
    header_rows = set()
    occupied = {}      # (r, c) -> True for cells filled by a rowspan
    widest = {}        # column -> longest single-line text, for column sizing

    for r, tr in enumerate(rows):
        while len(grid) <= r:
            grid.append([])
        c = 0
        for cell in tr["kids"]:
            if isinstance(cell, str) or cell["tag"] not in ("td", "th"):
                continue
            while occupied.get((r, c)):
                c += 1
            try:
                cs = max(1, min(20, int(cell["attrs"].get("colspan") or 1)))
                rs = max(1, min(50, int(cell["attrs"].get("rowspan") or 1)))
            except ValueError:
                cs = rs = 1
            if cell["tag"] == "th":
                header_rows.add(r)
            while len(grid[r]) <= c:
                grid[r].append(None)
            grid[r][c] = cell        # turned into a Paragraph once the font is settled
            if cs == 1:   # a spanning cell says nothing about one column's width
                longest = max(_node_text(cell).split("\n"), key=len, default="")
                if len(longest) > len(widest.get(c, "")):
                    widest[c] = longest
            for dr in range(rs):
                for dc in range(cs):
                    if dr or dc:
                        occupied[(r + dr, c + dc)] = True
                        while len(grid) <= r + dr:
                            grid.append([])
                        while len(grid[r + dr]) <= c + dc:
                            grid[r + dr].append(None)
                        grid[r + dr][c + dc] = ""
            if cs > 1 or rs > 1:
                spans.append(("SPAN", (c, r), (c + cs - 1, r + rs - 1)))
            c += cs

    width = max((len(row) for row in grid), default=0)
    if not width:
        return None

    # Columns are sized by what they actually hold, measured in the real font —
    # splitting the width evenly gives a "Qty" column the same room as a
    # description and shreds the long one into a ribbon. A single very wide
    # column is capped so it cannot starve the rest.
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase.pdfmetrics import stringWidth
    font = getattr(style, "fontName", "Helvetica")
    size = getattr(style, "fontSize", 9.5)

    def measure(font_size):
        # pad = the 6pt of cell padding plus slack, so a value that only just
        # fits is not pushed onto a second line by rounding
        pad, floor_w, cap_w = 12, 20, avail_width * 0.40
        out = []
        for c in range(width):
            try:
                w = stringWidth(widest.get(c, ""), font, font_size) + pad
            except Exception:
                w = avail_width / width
            out.append(max(floor_w, min(cap_w, w)))
        return out

    natural = measure(size)
    total = sum(natural)
    cell_style = style
    if total > avail_width:
        # A wide sheet gets a smaller font rather than columns squeezed until
        # every value wraps — down to 6.5pt, then the leftover is scaled away.
        shrunk = max(6.5, size * avail_width / total)
        if shrunk < size - 0.2:
            cell_style = ParagraphStyle("richcell", parent=style, fontSize=shrunk,
                                        leading=shrunk * 1.25)
            natural = measure(shrunk)
            total = sum(natural)
        col_widths = [n * avail_width / total for n in natural]
    else:
        col_widths = natural

    data = [[(_para(cell, cell_style) if isinstance(cell, dict) else (cell or ""))
             for cell in row] + [""] * (width - len(row))
            for row in grid]

    tbl = Table(data, colWidths=col_widths, repeatRows=1 if 0 in header_rows else 0,
                splitByRow=1, hAlign="LEFT")
    cmds = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9ca3af")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for hr in header_rows:
        cmds.append(("BACKGROUND", (0, hr), (-1, hr), colors.HexColor("#f3f4f6")))
    cmds += spans
    tbl.setStyle(TableStyle(cmds))
    return tbl


def html_flowables(value, style, avail_width):
    """Stored purpose -> reportlab flowables. Plain text yields one Paragraph;
    pasted tables become real PDF tables. Never raises: on any surprise the
    caller still gets the readable plain-text version."""
    from reportlab.platypus import Paragraph, Spacer

    s = str(value or "").strip()
    if not s:
        return [Paragraph("-", style)]
    if not is_rich_html(s):
        return [Paragraph(_escape(s, quote=False).replace("\n", "<br/>"), style)]
    try:
        tp = _TreeParser()
        tp.feed(s)
        tp.close()
        out = []
        loose = {"tag": "span", "attrs": {}, "kids": []}   # text between tables

        def flush():
            if loose["kids"]:
                p = _para(loose, style)
                if p:
                    out.append(p)
                loose["kids"] = []

        def walk(node):
            for kid in node["kids"]:
                if isinstance(kid, str):
                    if kid.strip():
                        loose["kids"].append(kid)
                    continue
                if kid["tag"] == "table":
                    flush()
                    tbl = _table_flowable(kid, style, avail_width)
                    if tbl is not None:
                        if out:
                            out.append(Spacer(1, 3))
                        out.append(tbl)
                elif _contains_table(kid):
                    # A wrapper around the table — the editor puts pasted
                    # content inside a <div>, and flattening that wrapper into
                    # inline text is what turned the grid into a run-on
                    # paragraph. Descend until the table itself is reached.
                    walk(kid)
                elif kid["tag"] in ("thead", "tbody", "tfoot", "tr", "td", "th"):
                    walk(kid)          # stray cells outside a table
                else:
                    loose["kids"].append(kid)

        walk(tp.root)
        flush()
        return out or [Paragraph("-", style)]
    except Exception as e:      # never let a malformed paste break the PDF
        print(f"[approval-pdf] rich purpose fell back to text: {e}")
        return [Paragraph(_escape(html_to_text(s), quote=False).replace("\n", "<br/>"), style)]


__all__ = ["sanitize_rich_html", "html_to_text", "html_flowables", "is_rich_html",
           "inline_table_borders", "has_table"]

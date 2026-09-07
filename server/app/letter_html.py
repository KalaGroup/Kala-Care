"""Rich letter text — the Python half.

The Welcome Letter's master text is authored in the app's WYSIWYG box, so what
is stored is HTML: real <ul>/<ol> lists, <b>/<i>/<u>, and font sizes as inline
styles. This module turns that stored value into the HTML that goes into the
emailed letter, and into the text/plain twin.

Two rules hold everything together:

  * ALLOW-LIST, never a blocklist. The stored value is re-sanitised here even
    though the browser sanitised it on the way in — the database is not a trust
    boundary and a letter goes to customers.
  * Every tag that leaves here carries INLINE styles. Email clients drop
    <style> blocks and classes, so justification, list padding and bold weight
    have to travel on each element.

Legacy master texts are PLAIN text with "* " / "1. " / "**bold**" markers and
are still handled by _render_letter_body() in welcome_letter_controller.py;
looks_like_html() is what decides which path a value takes.

Keep the allow-list and the styles in step with
client/src/utils/letterRichText.js and client/src/components/approval/richText.js.
"""

import re
from html import escape
from html.parser import HTMLParser

# ---------------------------------------------------------------- allow-list

ALLOWED_TAGS = {
    "p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "strike",
    "sub", "sup", "small", "mark", "ul", "ol", "li", "h1", "h2", "h3", "h4",
    "h5", "h6", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "td",
    "th", "caption",
}

# dropped WITH their contents; anything else unknown is unwrapped instead, so
# the words survive even when the tag does not
DROP_WITH_CONTENT = {"script", "style", "head", "meta", "link", "title",
                     "iframe", "object", "embed", "form", "input", "button"}

VOID_TAGS = {"br", "hr", "img", "input", "meta", "link"}

ALLOWED_ATTRS = {"td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}}

ALLOWED_STYLE_PROPS = {
    "color", "background-color", "background", "font-weight", "font-style",
    "font-size", "font-family", "text-align", "text-decoration",
    "vertical-align", "white-space", "border", "border-top", "border-right",
    "border-bottom", "border-left", "border-color", "border-style",
    "border-width", "border-collapse", "padding", "padding-top",
    "padding-right", "padding-bottom", "padding-left", "width", "height",
    "min-width", "list-style", "list-style-type", "list-style-position",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
}

UNSAFE_VALUE = re.compile(r"url\s*\(|expression\s*\(|javascript:|@import|behaviou?r\s*:",
                          re.I)

_HTML_HINT = re.compile(
    r"<(p|div|br|ul|ol|li|span|b|strong|i|em|u|h[1-6]|table|tr|td|th)\b[^>]*>", re.I)


def looks_like_html(value) -> bool:
    """Does this stored value carry markup, or is it a legacy plain text?"""
    return bool(_HTML_HINT.search(str(value or "")))


# ---------------------------------------------------------------- styling

BRAND = "#2f3192"
# margin-BOTTOM, never the `margin` shorthand: the Gap control in the editor
# writes margin-bottom on a block, and a shorthand injected here afterwards
# would silently wipe it out. Longhand on both sides lets _style_for()'s
# "the author wins" rule actually apply.
P_STYLE = ("margin-top:0;margin-bottom:9px;text-align:justify;"
           "text-justify:inter-word;color:#1f2937")
# list-style-position:outside is what gives a wrapped bullet its hanging
# indent, and it has to be INLINE — an email has no stylesheet at all.
LIST_STYLE = ("margin-top:0;margin-bottom:9px;padding-left:22px;"
              "text-align:justify;color:#1f2937;list-style-position:outside")
LI_STYLE = "margin-top:0;margin-bottom:6px"
# 600, not 700: at letter body size a full bold reads as a heavy blob. Matches
# BOLD_STYLE in letterRichText.js and `.letter-rich b` in index.css.
BOLD_STYLE = "font-weight:600"

_BLOCK_STYLES = {
    "p": P_STYLE,
    "div": P_STYLE,
    "ul": LIST_STYLE,
    "ol": LIST_STYLE,
    "li": LI_STYLE,
    "b": BOLD_STYLE,
    "strong": BOLD_STYLE,
}

_DECORATIVE = re.compile(r'^\s*["\'](.+?)\s*["\']\s*$')


def _clean_style(raw: str) -> str:
    """Keep only the visual declarations, and only safe values."""
    out = []
    for decl in str(raw or "").split(";"):
        if ":" not in decl:
            continue
        prop, _, val = decl.partition(":")
        prop, val = prop.strip().lower(), val.strip()
        if not val or prop not in ALLOWED_STYLE_PROPS or UNSAFE_VALUE.search(val):
            continue
        out.append(f"{prop}:{val}")
    return ";".join(out)


def _list_glyph(style: str):
    """A decorative bullet is stored as list-style-type: "* ". The browser draws
    it, but Outlook's Word engine ignores a string list-style-type and would
    print an unmarked list — so the marker is turned off and the character is
    written into each row as real text instead."""
    for decl in str(style or "").split(";"):
        prop, _, val = decl.partition(":")
        if prop.strip().lower() == "list-style-type":
            m = _DECORATIVE.match(val)
            if m:
                return m.group(1).strip()
    return None


class _Sanitizer(HTMLParser):
    """Allow-list rewriter that also stamps the letter's inline styles on."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.drop_depth = 0          # inside <script> etc.
        self.open_tags = []          # tags actually emitted, to close correctly
        self.list_glyphs = []        # per open <ul>, its decorative character
        self.pending_glyph = None    # written into the next <li>

    # ---- helpers ----
    def _style_for(self, tag, given):
        own = _clean_style(given)
        extra = _BLOCK_STYLES.get(tag)
        if tag == "ul" and self.list_glyphs and self.list_glyphs[-1]:
            # marker off, character written into each row instead
            own = ";".join(p for p in own.split(";")
                           if not p.strip().lower().startswith("list-style-type"))
            extra = f"{LIST_STYLE};list-style:none;padding-left:6px"
        if tag in ("ul", "ol") and extra is LIST_STYLE:
            # a marker only when the author has not chosen one
            if "list-style" not in own:
                extra = extra + (";list-style-type:decimal" if tag == "ol"
                                 else ";list-style-type:disc")
        if not extra:
            return own
        if not own:
            return extra
        # The author wins. A letter style is only injected for a property the
        # element does not already set — otherwise appending ours would quietly
        # override a colour or a size the author chose in the editor.
        theirs = {d.split(":", 1)[0].strip().lower() for d in own.split(";") if ":" in d}
        keep = [d for d in extra.split(";")
                if d.split(":", 1)[0].strip().lower() not in theirs]
        return ";".join([own] + keep) if keep else own

    # ---- parser callbacks ----
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.drop_depth:
            if tag in DROP_WITH_CONTENT:
                self.drop_depth += 1
            return
        if tag in DROP_WITH_CONTENT:
            self.drop_depth = 1
            return

        attr_map = {k.lower(): (v or "") for k, v in attrs}
        if tag == "ul":
            self.list_glyphs.append(_list_glyph(attr_map.get("style", "")))
        if tag == "ol":
            self.list_glyphs.append(None)

        if tag not in ALLOWED_TAGS:
            return                                    # unwrap: keep the text

        style = self._style_for(tag, attr_map.get("style", ""))
        bits = [tag]
        for name in sorted(ALLOWED_ATTRS.get(tag, ())):
            if attr_map.get(name):
                bits.append(f'{name}="{escape(attr_map[name], quote=True)}"')
        if style:
            bits.append(f'style="{escape(style, quote=True)}"')
        self.out.append("<%s>" % " ".join(bits))

        if tag not in VOID_TAGS:
            self.open_tags.append(tag)
        if tag == "li" and self.list_glyphs and self.list_glyphs[-1]:
            self.out.append(
                '<span style="display:inline-block;width:18px">%s</span>'
                % escape(self.list_glyphs[-1]))

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if self.drop_depth or tag not in ALLOWED_TAGS:
            return
        self.out.append(f"<{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.drop_depth:
            if tag in DROP_WITH_CONTENT:
                self.drop_depth -= 1
            return
        if tag in ("ul", "ol") and self.list_glyphs:
            self.list_glyphs.pop()
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag in self.open_tags:
            # close anything left dangling inside it, so the letter is well formed
            while self.open_tags:
                top = self.open_tags.pop()
                self.out.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data):
        if not self.drop_depth:
            self.out.append(escape(data, quote=False))

    def result(self) -> str:
        while self.open_tags:
            self.out.append("</%s>" % self.open_tags.pop())
        return "".join(self.out)


def render_html(value: str) -> str:
    """Stored letter HTML -> the HTML that goes into the emailed letter."""
    parser = _Sanitizer()
    parser.feed(str(value or ""))
    parser.close()
    html = parser.result()
    # the last block's bottom margin would double the gap above the footer band
    at = html.rfind("margin-bottom:9px")
    if at != -1:
        html = html[:at] + "margin-bottom:0" + html[at + len("margin-bottom:9px"):]
    return html


# ---------------------------------------------------------------- plain text

class _TextExtractor(HTMLParser):
    """The text/plain twin: list rows keep a marker and <ol> rows are numbered
    per list, so the message reads properly in a client that refuses HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.drop_depth = 0
        self.list_types = []
        self.counters = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.drop_depth or tag in DROP_WITH_CONTENT:
            self.drop_depth += 1
            return
        if tag in ("ul", "ol"):
            self.list_types.append(tag)
            self.counters.append(0)
        elif tag == "li" and self.list_types:
            if self.list_types[-1] == "ol":
                self.counters[-1] += 1
                self.parts.append("\n  %d. " % self.counters[-1])
            else:
                self.parts.append("\n  • ")
        elif tag in ("br", "p", "div", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.drop_depth:
            self.drop_depth -= 1
            return
        if tag in ("ul", "ol"):
            if self.list_types:
                self.list_types.pop()
                self.counters.pop()
            self.parts.append("\n")
        elif tag in ("p", "div"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.drop_depth:
            self.parts.append(data.replace(" ", " "))


def render_text(value: str) -> str:
    """Stored letter HTML -> readable plain text."""
    parser = _TextExtractor()
    parser.feed(str(value or ""))
    parser.close()
    text = "".join(parser.parts)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

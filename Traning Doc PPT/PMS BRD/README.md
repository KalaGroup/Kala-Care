# PMS — Business Requirements Document (Overleaf source)

`main.tex` is the **BRD for the PMS module** — text and tables only, no screenshots.
The only image in it is the KALA logo on the title page and in the page header, and even
that is optional: if `logo.png` is not in the project the document still compiles,
simply without it.

Its core is **Section 5**: twenty-eight numbered business requirements (BR-01 … BR-28),
each shown as a bordered block with three rows —

| | |
|---|---|
| **Client requirement** | what the business asked for, in their own words |
| **Our solution** | what was delivered against it |
| **Delivered in** | the screen it can be seen on |

No technical content: no database tables, no API or endpoint names, no source-file names.

## Files in this folder

| File | What it is |
|---|---|
| `main.tex` | the BRD source — compile this |
| `logo.png` | the KALA logo, used on the title page and in the header (optional) |

## Compiling

**Overleaf:** new project → *Upload Project* → drop this folder in (`main.tex` and, if
you want the logo, `logo.png`). Compiler: **pdfLaTeX** (the default). Run it **twice** so
the table of contents fills in.

**Locally:** `pdflatex main.tex` twice, from inside this folder so `logo.png` is found.

**To drop the logo entirely:** just don't upload `logo.png` — nothing else needs editing.

## Document structure

Front matter: title page, Document Control, revision history, sign-off table, contents.

1. Purpose of this Document
2. Business Background — why PMS was commissioned (time, trust, timing, lost detail)
3. Scope — in scope / out of scope
4. Stakeholders and Users
5. **Business Requirements and Our Solution** — BR-01 … BR-28 in seven areas:
   A data foundation · B the annual plan and master lists · C sales and labour reporting ·
   D service engineer performance · E training · F annual management reports ·
   G access, output and platform
6. The Data PMS Reads — the 13 Excel files and which reports read each
7. How the Data Flows — upload → stored once → grouped by the masters → measured against
   the AOP → report and Excel
8. What Was Delivered — the six pages, and the requirements each one closes
9. **Data Constraints and the Decisions Taken** — C-01 … C-05, the five things in the
   source data that could not be solved by building more, and what was agreed instead
10. Assumptions and Dependencies
11. Acceptance Criteria
- Appendix: Glossary

## Adding a requirement later

Copy an existing block and edit the four arguments:

```latex
\brreq{BR-29 \quad Short title of the requirement}
{\qt{What the business asked for, in their words.}}
{What was delivered against it.}
{Page $\rightarrow$ where it is seen}
```

## Related

`../PMS Documentation/main.tex` — the full page-wise module documentation for the client
(what each screen does, which data it uses; that one does carry screenshots). The BRD
answers *what was asked and what was built*; that document answers *how each report
works*.

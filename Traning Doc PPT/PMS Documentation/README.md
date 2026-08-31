# KCGL ERP — PMS Documentation (Overleaf source)

`main.tex` is the **client-facing** PMS module document — a single, self-contained
LaTeX file following the same layout as the MOM Tracking document (`../MOM.pdf`).

It contains **no technical content**: no database table names, no API or endpoint
names, no source-file or function names. Every section says what the screen is for,
**which data it uses** (file name + the Excel column names), how that data becomes
each column, and how to handle the page.

`main-internal-technical.tex` is the earlier version that *does* carry the technical
detail (tables, endpoints, code files). Keep it for the development team, or delete
it — it is not needed to build the client document.

## Compiling

**Overleaf:** new project → *Upload Project* → drop this folder in (`main.tex` +
`screens/`), or paste `main.tex` into a blank project. Compiler: **pdfLaTeX** (the
default). Only stock TeX Live packages are used.

**Locally:** run `pdflatex main.tex` twice, so the long tables settle.

## Document structure

1. Introduction
2. Roles & Access
3. Client Requirements — R1…R28
4. **The Data PMS Reads** — the 13 Excel files and which report reads each
5. **How the Data Flows** — upload → stored once → grouped by the masters → measured
   against the AOP → report and Excel
6. **Page-wise Development Process** — 20 sections, each with *Covers requirements*,
   *Purpose*, **Data used**, *How it works*, *How to handle* and a screenshot
7. Cross-cutting — rights, freshness, visible gaps, Excel export, colour language, dates
8. Appendix — Glossary (AOP, D/BAMC, CDI, MaxTTR, EFSR, LMS, FTR/FVR …)

## Screenshots

Every page section ends with a figure. If the image is missing the document still
compiles and prints a framed placeholder naming the file it wants, so you can build
the PDF today and add screenshots later.

Drop PNGs into `screens/` with these exact names:

| File | Screen to capture |
|---|---|
| `aop-target-master.png` | AOP & Master → Target Master (FY grid + working-days calendar) |
| `aop-sr-type-master.png` | AOP & Master → any SR Type Master tab |
| `aop-lead-category-master.png` | AOP & Master → Lead Category Master |
| `aop-cdi-target.png` | AOP & Master → CDI Target Master |
| `aop-amc-bandhan.png` | AOP & Master → AMC & Bandhan AOP (both tables) |
| `aop-service-load.png` | AOP & Master → Service Load AOP |
| `profile-se-uid-master.png` | Profile → Service Engineer UID Master |
| `sales-upload-preview.png` | Sales & Labour → upload boxes + Uploaded File Preview |
| `sales-report-all.png` | Sales & Labour → All (Spare + Labour) |
| `sales-report-branchwise.png` | Sales & Labour → Branch-wise Report |
| `sales-report-fy.png` | Sales & Labour → FY / Quarterly / Month-wise |
| `employee-productivity.png` | Employee Productivity |
| `sr-allocation.png` | SR Allocation Report |
| `training-report.png` | Training Report (By Employee / By Skill) |
| `annual-service-penetration.png` | Annual Reports → Service Penetration |
| `annual-amc-projection.png` | Annual Reports → AMC & Bandhan Projection |
| `annual-amc-monthly.png` | Annual Reports → AMC (monthly sheet) |
| `annual-cdi.png` | Annual Reports → Customer Delight Index |
| `annual-service-load.png` | Annual Reports → Service Load and Response |

## Editing conventions used in `main.tex`

- `\covers{R4, R5}` — the *Covers requirements …* line opening each page section
- `\purpose{…}`, `\dataused`, `\devproc` (*How it works*), `\handle{…}` — the fixed blocks
- `\col{…}` — an Excel column name from a source file
- `\qt{…}` — quoted text
- `\screenshot{screens/x.png}{Caption}` — the figure with the missing-image fallback

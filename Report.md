# Kala-Care ERP — Import Excel Files: Must vs Dynamic Columns Report

This report analyzes all 10 Excel file types on the Import page. For each file it shows the **MUST columns** (used for linking tables or used somewhere in the ERP) and marks everything else as **DYNAMIC** (only stored and displayed, never used in logic).

Code analyzed: `import_controller.py`, `import_routes.py`, `customer_controller.py`, `engagement_controller.py`, `campaign_controller.py`, `emp_per_controller.py`, `customer_model.py`, and the frontend pages (`Import.jsx`, `CustomerEng.jsx`, `Customer.jsx`, `Dashboard.jsx`).

---

## 1. How the linking works (read this first)

Your whole ERP revolves around **three linking columns**. Every other column is just data.

| Link column | What it does |
|---|---|
| **Instance ID** (called `INSTANCE ID`, `ASSET NUMBER`, `Pulse Instance ID`, `Instance Id`, `Instance Id [Asset #]` depending on the file) | The **master key**. Every import row is linked to the central `customers` table by this. Followups, campaigns, letters, Customer 360, service-due status — all of them find data using `instance_id`. A row without it is either **skipped** or saved as an orphan. |
| **Engine Serial No** (called `ENGINE SERIAL NO`, `EngineNo`, `Genset Number`, `Engine Serial#`) | The **backup key**. When a file has no instance ID (Regular Bandhan) or the instance ID is blank (Open SR), the system searches this engine number in 6 tables (`asset_detailed`, `oil_services`, 3 quote tables, `open_sr_load_reports`) to find the instance_id. If the engine number is missing, the row can never be matched to a customer. |
| **BRANCH ID** (only exists in AMC, Asset Detailed, Oil Service, LMS) | Controls **who sees the customer**. It is copied to `customers.branch_id`, and branch rules / branch users filter customers by it. If BRANCH ID is missing from all 4 files, the customer belongs to no branch. |

**Central hub:** `customers` table (unique on `instance_id`). Each import also creates/updates the customer's **name, phone, email, PAN, location** from specific columns of each file (listed per file below). These 5 fields power the follow-up screens, letters, and Customer 360.

---

## 2. File-by-file report

### File 1 — AMC Population Report → table `amc_agreements`

Import rule: only rows where `AGREEMENT STATUS = ACTIVE` are taken, one row per `INSTANCE ID` (first active). Upsert key = `instance_id`.

| MUST column | Why it is must |
|---|---|
| **INSTANCE ID** | Master link key. Row skipped without it. Creates/updates the customer. |
| **AGREEMENT STATUS** | The import **filters on it** (`== ACTIVE`). If this column is missing, **zero rows import**. |
| **AGREEMENT NUMBER** | Marked critical in `get_critical_columns()` — file is rejected without it. Shown in letters/Customer 360. |
| **BRANCH ID** | Copied to `customers.branch_id` → controls branch visibility of the customer. |
| **AGREEMENT START DATE** | Engagement logic sorts agreements by it (latest agreement wins) when computing AMC due status. |
| **AGREEMENT END DATE** | Drives the **AMC-due / service-due** calculation on the engagement page and letters ("your AMC expires on..."). |
| **KVA RATING** | Used in campaign letters (`{kva}` placeholder) and Customer 360 panel. |
| CUSTOMER NAME* | Feeds `customers.customer_name` (via generic mapping). |

Dynamic (safe to make optional): ZONE NAME, SD ID, SD NAME, BRANCH NAME, SEGMENT, ENGINE MODEL, NUMBER OF AGREEMENT YEARS, AGREEMENT NAME, AGREEMENT TYPE, AGREEMENT CREATED DATE, AGREEMENT PRODUCT NAME, AGREEMENT INVOICE TYPE, COMMISSIONING DATE, and all 6 LAST AGREEMENT ... columns.

---

### File 2 — Asset Detailed Report → table `asset_detailed`  ⭐ MOST IMPORTANT FILE

This file is the **foundation**. It creates the instance-ID ↔ engine-serial ↔ branch mapping that 4 other files depend on. Upsert key = `instance_id`.

| MUST column | Why it is must |
|---|---|
| **ASSET NUMBER** | This IS the instance_id (master key). Critical column — file rejected without it. |
| **ENGINE SERIAL NO** | Critical column. Source #1 of the engine→instance map used to match **Regular Bandhan** and **Open SR** rows. |
| **BRANCH ID** | Main source of `customers.branch_id` (branch visibility). |
| **WARRANTY EXPIRY DATE** | Drives **warranty-due** status on the engagement page and the CSP due-date cap (`get_warranty_expiry_map`). Used in letters. |
| **GOEM OEM** | Used by campaign CSP letter matching, distinct-GOEM dropdown (`campaign_controller`), and employee-performance lookup. |
| **SEGMENT** | Used to compute CSP SR due days and in employee-performance asset lookup. |
| **ENGINE MODEL** | Letter placeholder `{engine_model}` and Customer 360. |
| **KVA RATING** | Letters + Customer 360 (fallback when AMC has no KVA). |
| **ACCOUNT NAME** | Feeds `customers.customer_name`. |
| **CONTACT PHONE NUMBER** | Feeds `customers.phone_number`. |
| **CONTACT EMAIL ID** | Feeds `customers.email`. |
| **INSTALLATION SITE ADDRESS** | Feeds `customers.location`. |
| COMMISSIONING DATE | Shown in Customer 360 / letters. |
| PRODUCT SEGMENT | Shown in Customer 360 / letter data. |

Dynamic: ZONE NAME, SD ID, SD NAME, BRANCH NAME, DISTRICT, INSTALLATION DATE, APPLICATION CODE, CUSTOMER NAME, CUSTOMER SEGMENT, ASSET OPERATIONAL STATUS, KRM NUMBER, KRM STATUS, KRM ACTIVE/INACTIVE DATE, KRM SUBSCRIPTION START/END DATE. (KRM fields are stored and displayed in the table view only.)

---

### File 3 — Asset Details with Last Oil Service → table `oil_services`

Upsert key = `instance_id`.

| MUST column | Why it is must |
|---|---|
| **ASSET NUMBER** | Instance_id (master key). Critical column. |
| **ENGINE SERIAL NO** | Critical column. Source #2 of the engine→instance map. |
| **BRANCH ID** | One of the 4 sources of `customers.branch_id`. |
| **LAST OIL CHANGE DATE** | Drives the **oil-service-due** logic on the engagement page (checked per customer). |
| **LAST OIL CHANGE SR TYPE** | Read together with the date in the oil-due logic. |
| **LAST SR CLOSE DATE** | Service history in Customer 360 is ordered by it. |
| **ACCOUNT NAME** | Feeds `customers.customer_name`. |
| **CONTACT PHONE NUMBER** | Feeds `customers.phone_number`. |
| LAST CLOSED SR NUMBER | Shown in service history. |

Dynamic: ZONE NAME, SD ID, SD NAME, BRANCH NAME, COMMISSIONING DATE, PRODUCT SEGMENT, APPLICATION CODE, LAST SR TYPE, LAST SR SUBTYPE, LAST OIL CHANGE SR NUMBER, LAST OIL CHANGE SR SUB TYPE, INSTALLATION SITE ADDRESS, LAST SERVICE HRS.

---

### Files 4, 5, 6 — Anubandhan Plus / Anubandhan / BandhanPlus Quotes Reports
→ tables `anubandhan_plus_quotes`, `anubandhan_quotes`, `bandhan_plus_quotes`

All three files have **identical structure and identical rules**. Import takes the first row per `Pulse Instance ID`. Upsert key = `instance_id`.

| MUST column | Why it is must |
|---|---|
| **Pulse Instance ID** | Master link key + dedup group key. Row skipped without it. Critical column. |
| **EngineNo** | Critical column. Source of the engine→instance map (used by Regular Bandhan / Open SR matching). |
| **QuotationRefNo** | Critical column — file rejected without it. Displayed in quote history. |
| **CompanyName** | Feeds `customers.customer_name` (BandhanPlus mapping: CompanyName first). |
| **MobileNo** | Feeds `customers.phone_number`. |
| **EmailId** | Feeds `customers.email`. |
| **City** | Feeds `customers.location` (BandhanPlus mapping). |
| CreatedDateTime | Quote history is displayed/ordered by it. |

Dynamic (the long payment tail): Id, ContactPersonName, GensetKVA, Zone, State, Location, NoOfYears, GensetRunningPerYear, Status, PaymentType, TransactionId, BankName, AccountNo, DateOfPayment, PaymentUpdateDateTime, IsNEFTConfirm, IsChequeConfirm, both Cheque address/dealer columns, Cheque Deposited, Cheque To Dealer, Employee Name, Pulse Id, IsInvoiceSent, IsRefund, AgentId, QuotePrice, Quotation Value Including tax, Name of Agent, Actual Amount, Reason of Short Payment, Status updated by Admin, Quotation Expiry Date, IsExpired, Payment Updated Month, New Price Applicable, QuotationType.

---

### File 7 — Pulse Quotation - Service Only → table `pulse_quotations`

Import takes first row per `Instance Id`. Upsert key = `instance_id`.

| MUST column | Why it is must |
|---|---|
| **Instance Id** | Master link key + dedup key. Row skipped without it. Critical column. |
| **Quote ID** | Critical column — file rejected without it. Shown in quote history. |
| **Account** | Feeds `customers.customer_name`. |
| **Account/Contact Phone Number** | Feeds `customers.phone_number`. |
| **Account/Contact Primary Email** | Feeds `customers.email`. |
| **Installation Site Address** | Feeds `customers.location`. |
| Creation Date | Quote history ordered/displayed by it. |
| Total Amount | Displayed in quotation views. |

Dynamic: First level observations, Quote Status, SR Type, SR Sub Type, Bill To Address, Ship To Address, First Name, Last Name, Service Dealer, Labor Amount, Parts Amount, Prepared By, Recommended By, Finance Company Address, Account Number, Purpose Of Quotation, SR#:, Quote Revised Flag, Quote Submitted Date, Exception Enquiry #, Lead #, and all 4 Quotation Lead Assigned columns.

---

### File 8 — Regular Bandhan Customers Report → table `regular_bandhan`

⚠️ **This file has NO instance ID column at all.** Linking is 100% dependent on the genset number. Upsert key = `Quotation Ref No.`.

| MUST column | Why it is must |
|---|---|
| **Genset Number** | Rows **without it are skipped completely**. It is looked up in the engine→instance map (built from files 2, 3, 4, 5, 6, 10) to find the instance_id. Critical column. |
| **Quotation Ref No.** | The **upsert key** for this table (records are updated by it, not by instance). Critical column. |
| **Name** | Feeds `customers.customer_name`. |
| **Mobile** | Feeds `customers.phone_number`. |
| **Email** | Feeds `customers.email`. |
| **PAN Card No.** | Feeds `customers.pan_number` (this file is the main PAN source). |
| Billing Location / DG Location / City | First non-empty one feeds `customers.location`. |

Dynamic: Name of Agent, Password, Billing State/City/Address 1/Address 2/Pincode, DG State/City/Address 1/Address 2/Pincode, Type of Customer, Date, GSTN No., Payment type, Payment Update Date, Contact Person Name, Zone, Actual Amount, Reason of Short Payment, Status updated by Admin.

> **Note:** if a genset number is not found yet, the row saves with `instance_id = NULL`, and the `match_pending_regular_bandhan()` job re-matches it after every future import. So import Asset Detailed **before** this file.

---

### File 9 — LMS Data for ERP → table `lms_data`

Multiple leads per instance are allowed. Upsert key = `Lead Number`.

| MUST column | Why it is must |
|---|---|
| **Instance ID** | Master link key. Rows skipped without it. Enforced by validation. |
| **Lead Number** | The **upsert key** — leads are created/updated by it. Enforced by validation. |
| **SD Branch Code** | This is what the code actually reads for `branch_id` (one of the 4 branch sources for customers). |
| **Account Name** | Feeds `customers.customer_name`. |
| **Account Contact Number** | Feeds `customers.phone_number`. |
| **Account Contact Email ID** | Feeds `customers.email`. |
| **Installation Site Address** | Feeds `customers.location`. |
| **Lead Created Date** | LMS history in Customer 360 is ordered by it. |
| Lead Status, Lead Raised By | Queried/displayed in lead views. |

Dynamic: everything else — Lead Raised For, Lead Assigned To, SD Code, SD Name, SD Branch Name, Service Request Number, SR Type / Sub Type / Sub Type.1, Account ID, Tele-Caller fields, Enquiry Allocation Remarks, Engine App Code, Engine Serial No, Engine Model, Pin Code, Segment, kVA Rating, Commissioning Date, City, District, State, Asset Contact fields, eFSR fields, Qualifying Date, all Quotation fields, Enquiry Loss Reason, Service Engineer fields, Order Number, SIC fields, Invoice fields, Lead Source, Next Action fields, New Contact, Lead Contact Number, Lead Assign To SD.

> ⚠️ **Bug found:** validation for this file only checks `Instance ID` and `Lead Number` (exact case). The `get_critical_columns()` list has them in UPPERCASE (`INSTANCE ID`, `LEAD NUMBER`) but that list is never used for LMS because of the special-case branch. Also, the Engine Serial No in this file is stored but **NOT** added to the engine→instance matching map — only files 2, 3, 4, 5, 6, 10 feed that map.

---

### File 10 — Open SR Load Report → table `open_sr_load_reports`

Upsert key = `Service Request #`.

| MUST column | Why it is must |
|---|---|
| **Service Request #** | The **upsert key** — SRs are created/updated by it. Critical column. |
| **Instance Id [Asset #]** | Master link key (note: value can be in "Asset #: XXXX" format, the code strips the prefix). Critical column. |
| **Engine Serial#** | Critical column. Backup matching key — when instance is blank, `match_pending_open_sr_records()` finds the customer through it. Also feeds the engine→instance map. |
| **SR Due Date** | Displayed/used in SR views and CSP campaign due reports. |
| **SR Type / SR Sub-Type / Status** | Used in CSP campaign info flows (rows where SR TYPE = CSP feed campaign CSP info; due-date computation uses segment + open date). |
| **Account** / **Customer Name** | Feed `customers.customer_name` (Account first). |
| **Customer Mobile #** / **Primary Phone#** | Feed `customers.phone_number`. |
| **Account/Contact Primary Email** | Feeds `customers.email`. |
| **Installation Site Address** | Feeds `customers.location`. |
| Oil Change Flg, Segment, Engine Model | Used in CSP campaign info / due-day computation / display. |

Dynamic: the entire long tail — Appointment Date, Service Dealer, Problem Code, Close Date/Time, VOC, Contact Last Name, Engine App Code, Engine Series, Ticket#, Task Start/End Date, Under Monitoring fields, all Convert PM to Wet PM fields, eFSR Engineer Remarks, Quick Ticket SR Comments, Actual SR Due Date, Genset Appcode, Contact Name, Mode, Special Tool fields, Repeat, Assigned To, Claim Created, Agreement #, Cancellation fields, CSP Cancellation fields, ASM/ASE Remarks fields, Battery Charger Availability, Wet PM Due Flag, all Cap Limit fields, CSP Prepone fields, all 9 Bandhan PM lock/flag columns, Account Id, SR Created BY, eFSR KRM Number, Dry CSP Approved fields.

---

## 3. Quick summary table — the "must" list per file

| # | Excel file | Link key (instance) | 2nd key (engine) | Upsert / dedup key | Branch source | Customer contact columns |
|---|---|---|---|---|---|---|
| 1 | AMC Population Report | INSTANCE ID | — | INSTANCE ID (first ACTIVE) | BRANCH ID ✅ | (generic name mapping) |
| 2 | Asset Detailed Report | ASSET NUMBER | ENGINE SERIAL NO | ASSET NUMBER | BRANCH ID ✅ | ACCOUNT NAME, CONTACT PHONE NUMBER, CONTACT EMAIL ID, INSTALLATION SITE ADDRESS |
| 3 | Asset Details with Last Oil Service | ASSET NUMBER | ENGINE SERIAL NO | ASSET NUMBER | BRANCH ID ✅ | ACCOUNT NAME, CONTACT PHONE NUMBER |
| 4 | Anubandhan Plus Quotes | Pulse Instance ID | EngineNo | Pulse Instance ID (first) | — | CompanyName, MobileNo, EmailId |
| 5 | Anubandhan Quotes | Pulse Instance ID | EngineNo | Pulse Instance ID (first) | — | CompanyName, MobileNo, EmailId |
| 6 | BandhanPlus Quotes | Pulse Instance ID | EngineNo | Pulse Instance ID (first) | — | CompanyName, MobileNo, EmailId, City |
| 7 | Pulse Quotation - Service Only | Instance Id | — | Instance Id (first) + Quote ID | — | Account, Account/Contact Phone Number, Account/Contact Primary Email, Installation Site Address |
| 8 | Regular Bandhan Customers | *(none — via engine)* | **Genset Number** | Quotation Ref No. | — | Name, Mobile, Email, PAN Card No. |
| 9 | LMS Data for ERP | Instance ID | — | **Lead Number** | SD Branch Code ✅ | Account Name, Account Contact Number, Account Contact Email ID, Installation Site Address |
| 10 | Open SR Load Report | Instance Id [Asset #] | Engine Serial# | **Service Request #** | — | Account/Customer Name, Customer Mobile #/Primary Phone#, Installation Site Address |

Columns used by ERP **business logic** (beyond linking): AGREEMENT STATUS + START/END DATE + KVA (file 1); WARRANTY EXPIRY DATE, GOEM OEM, SEGMENT, ENGINE MODEL, KVA RATING (file 2); LAST OIL CHANGE DATE + SR TYPE, LAST SR CLOSE DATE (file 3); CreatedDateTime (files 4-6); Creation Date, Total Amount (file 7); Lead Created Date, Lead Status (file 9); SR Due Date, SR Type/Sub-Type/Status, Oil Change Flg, Segment (file 10).

**Everything not listed above can safely be made dynamic** — those columns are only saved to the table and shown in the raw table viewer; no query, filter, computation, letter, or campaign uses them.

## 4. Recommended import order (because of engine matching)

1. **Asset Detailed Report** (creates instance + engine + branch foundation)
2. Asset Details with Last Oil Service
3. AMC Population Report
4. LMS Data for ERP
5. Anubandhan Plus / Anubandhan / BandhanPlus Quotes
6. Pulse Quotation - Service Only
7. **Open SR Load Report** (needs engine map for blank instances)
8. **Regular Bandhan Customers Report** (fully depends on engine map)

The `match_pending_*` jobs will retro-fix wrong order, but importing in this order avoids NULL-instance orphans on day one.

## 5. Issues noticed while analyzing (worth fixing)

1. **LMS branch mismatch:** UI header list says `SD Branch Code`, but backend `extract_branch_id()` for LMS still looks for column `BRANCH ID` — so `customers.branch_id` is **never set from the LMS file** through that path (only through the direct `branch_id` mapping into `lms_data`, which is read later by `_build_instance_to_branch_map`). It works indirectly, but the `extract_branch_id` mapping is dead code for LMS.
2. **LMS Engine Serial No** is stored but not part of the engine→instance matching map. If you want LMS engines to help match Regular Bandhan / Open SR rows, add `LMSData.engine_serial_no` to `_build_engine_to_instance_map()`.
3. **AGREEMENT STATUS** is not in the critical columns for AMC, but the import filters on it — a file missing that column crashes/imports nothing. Add it to `get_critical_columns()`.
4. Header validation is **case-sensitive and exact** — if you make columns dynamic, keep the critical/link headers exact (including symbols like `#`, `.`, and brackets).
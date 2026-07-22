from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import approval_controller as ac

router = APIRouter(prefix="/approval", tags=["approval-application"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- ACCESS ---------------- #

@router.get("/access")
def get_access(user_id: str = Header(...), db: Session = Depends(get_db)):
    """The caller's approval level + whether they can open the Rights Master."""
    return {"success": True, "access": ac.get_access(db, user_id)}


# ---------------- RIGHTS MASTER (kala000001 / 31240002 only) ---------------- #

@router.get("/rights")
def list_rights(user_id: str = Header(...), db: Session = Depends(get_db)):
    return {"success": True, "rights": ac.list_rights(db, user_id)}


@router.get("/rights/users")
def list_assignable_users(user_id: str = Header(...), db: Session = Depends(get_db)):
    """Users the rights master can assign a level to (rights masters excluded)."""
    return {"success": True, "users": ac.list_assignable_users(db, user_id)}


@router.post("/rights")
def set_right(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    target = (body.get("user_id") or "").strip()
    level = (body.get("level") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="user_id is required")
    right = ac.set_right(db, user_id, target, level)
    return {"success": True, "message": "Right saved successfully", "right": right}


@router.delete("/rights/{target_user_id}")
def remove_right(target_user_id: str, user_id: str = Header(...), db: Session = Depends(get_db)):
    ac.remove_right(db, user_id, target_user_id)
    return {"success": True, "message": "Right removed — user falls back to Employee rights"}


# ---------------- APPLICATIONS ---------------- #

@router.get("/applications")
def list_applications(
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    search: Optional[str] = None,
    user_id: str = Header(...),
    db: Session = Depends(get_db),
):
    data = ac.list_applications(db, user_id, status, request_type, search)
    return {"success": True, **data}


@router.get("/summary")
def get_summary(user_id: str = Header(...), db: Session = Depends(get_db)):
    return {"success": True, "summary": ac.get_summary(db, user_id)}


@router.post("/applications")
async def create_application(
    # category/branch are Optional at the HTTP layer: FastAPI treats an EMPTY
    # form value as missing, and drafts may legitimately leave them blank.
    # The controller enforces them for real (non-draft) submissions.
    category: Optional[str] = Form(None),
    request_type: str = Form(...),
    branch: Optional[str] = Form(None),
    branch_name: Optional[str] = Form(None),
    customer_name: Optional[str] = Form(None),
    instance_id: Optional[str] = Form(None),
    sr_no: Optional[str] = Form(None),
    invoice_no: Optional[str] = Form(None),
    delivery_challan: Optional[str] = Form(None),
    quotation_no: Optional[str] = Form(None),
    quotation_amount: Optional[str] = Form(None),
    discount_percent: Optional[str] = Form(None),
    credit_days: Optional[str] = Form(None),
    expense_amount: Optional[str] = Form(None),
    expense_type: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    remark: Optional[str] = Form(None),
    save_as_draft: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user_id: str = Header(...),
    db: Session = Depends(get_db),
):
    as_draft = str(save_as_draft).lower() in ("1", "true", "yes")
    application = await ac.create_application(db, user_id, {
        "category": category,
        "request_type": request_type,
        "branch": branch,
        "branch_name": branch_name,
        "customer_name": customer_name,
        "instance_id": instance_id,
        "sr_no": sr_no,
        "invoice_no": invoice_no,
        "delivery_challan": delivery_challan,
        "quotation_no": quotation_no,
        "quotation_amount": quotation_amount,
        "discount_percent": discount_percent,
        "credit_days": credit_days,
        "expense_amount": expense_amount,
        "expense_type": expense_type,
        "description": description,
        "remark": remark,
    }, files, as_draft=as_draft)
    msg = "Draft saved" if as_draft else "Application submitted successfully"
    return {"success": True, "message": msg, "application": application}


@router.put("/applications/{app_id}")
async def update_application(
    app_id: int,
    category: Optional[str] = Form(None),
    request_type: str = Form(...),
    branch: Optional[str] = Form(None),
    branch_name: Optional[str] = Form(None),
    customer_name: Optional[str] = Form(None),
    instance_id: Optional[str] = Form(None),
    sr_no: Optional[str] = Form(None),
    invoice_no: Optional[str] = Form(None),
    delivery_challan: Optional[str] = Form(None),
    quotation_no: Optional[str] = Form(None),
    quotation_amount: Optional[str] = Form(None),
    discount_percent: Optional[str] = Form(None),
    credit_days: Optional[str] = Form(None),
    expense_amount: Optional[str] = Form(None),
    expense_type: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    remark: Optional[str] = Form(None),
    submit: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user_id: str = Header(...),
    db: Session = Depends(get_db),
):
    """Update a draft; with submit=true it is numbered and enters the approval flow."""
    do_submit = str(submit).lower() in ("1", "true", "yes")
    application = await ac.update_application(db, user_id, app_id, {
        "category": category,
        "request_type": request_type,
        "branch": branch,
        "branch_name": branch_name,
        "customer_name": customer_name,
        "instance_id": instance_id,
        "sr_no": sr_no,
        "invoice_no": invoice_no,
        "delivery_challan": delivery_challan,
        "quotation_no": quotation_no,
        "quotation_amount": quotation_amount,
        "discount_percent": discount_percent,
        "credit_days": credit_days,
        "expense_amount": expense_amount,
        "expense_type": expense_type,
        "description": description,
        "remark": remark,
    }, files, submit=do_submit)
    msg = "Application submitted successfully" if do_submit else "Draft saved"
    return {"success": True, "message": msg, "application": application}


@router.put("/applications/{app_id}/approve")
def approve_application(
    app_id: int,
    body: Optional[dict] = None,
    user_id: str = Header(...),
    db: Session = Depends(get_db),
):
    remark = (body or {}).get("remark")
    application = ac.approve_application(db, user_id, app_id, remark)
    return {"success": True, "message": "Application approved", "application": application}


@router.put("/applications/{app_id}/reject")
def reject_application(
    app_id: int,
    body: Optional[dict] = None,
    user_id: str = Header(...),
    db: Session = Depends(get_db),
):
    remark = (body or {}).get("remark")
    application = ac.reject_application(db, user_id, app_id, remark)
    return {"success": True, "message": "Application rejected", "application": application}


@router.delete("/applications/{app_id}")
def delete_application(app_id: int, user_id: str = Header(...), db: Session = Depends(get_db)):
    ac.delete_application(db, user_id, app_id)
    return {"success": True, "message": "Application deleted"}


# ---------------- EXPENSE TYPE MASTER ---------------- #

@router.get("/expense-types")
def list_expense_types(db: Session = Depends(get_db)):
    """Dropdown values for the Expense form — any logged-in user."""
    return {"success": True, "expense_types": ac.list_expense_types(db)}


@router.post("/expense-types")
def add_expense_type(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    row = ac.add_expense_type(db, user_id, body.get("name"))
    return {"success": True, "message": "Expense type added", "expense_type": row}


@router.put("/expense-types/{type_id}")
def rename_expense_type(type_id: int, body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    row = ac.rename_expense_type(db, user_id, type_id, body.get("name"))
    return {"success": True, "message": "Expense type renamed", "expense_type": row}


@router.delete("/expense-types/{type_id}")
def remove_expense_type(type_id: int, user_id: str = Header(...), db: Session = Depends(get_db)):
    ac.remove_expense_type(db, user_id, type_id)
    return {"success": True, "message": "Expense type removed"}


# ---------------- AUTHORITY MATRIX (COO view) ---------------- #

@router.get("/matrix")
def get_authority_matrix(user_id: str = Header(...), db: Session = Depends(get_db)):
    """All users (branch-wise) with level + limits + chain rules, and the HOD
    category assignments — one payload for the Authority Matrix screen."""
    return {"success": True, **ac.get_authority_matrix(db, user_id)}


@router.post("/matrix/authority")
def set_authority(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    res = ac.set_authority(db, user_id, body)
    return {"success": True, "message": "Authority saved", **res}


@router.post("/matrix/employee-rule")
def set_employee_rule(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    res = ac.set_employee_rule(db, user_id, body)
    return {"success": True, "message": "Approval flow rule saved", **res}


@router.post("/matrix/exclusion")
def set_approver_exclusion(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    """Body: { employee_id, approver_id, excluded } — block/allow one approver
    for one employee's records."""
    res = ac.set_approver_exclusion(db, user_id, body)
    return {"success": True, "message": "Exclusion saved", **res}


@router.post("/matrix/expense-type-limit")
def set_expense_type_limit(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    row = ac.set_expense_type_limit(db, user_id, body)
    return {"success": True, "message": "Expense type limit saved", "limit": row}


@router.post("/matrix/hod-category")
def set_hod_category(body: dict, user_id: str = Header(...), db: Session = Depends(get_db)):
    """Body: { category, user_ids: [...] } — replaces the approver list."""
    user_ids = body.get("user_ids", body.get("user_id"))
    res = ac.set_hod_category(db, user_id, body.get("category"), user_ids)
    return {"success": True, "message": "HOD category approvers saved", **res}


@router.get("/applications/{app_id}/pdf")
def download_approval_pdf(app_id: int, db: Session = Depends(get_db)):
    """PDF of an APPROVED record — details + approval trail + attachments."""
    filename, pdf = ac.get_approval_pdf(db, app_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------- ATTACHMENTS ---------------- #

@router.get("/attachments/{attachment_id}/view")
def view_attachment(attachment_id: int, db: Session = Depends(get_db)):
    row = ac.get_attachment(db, attachment_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="Attachment data is missing")
    return Response(content=row.data, media_type=row.content_type or "application/octet-stream")


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    row = ac.get_attachment(db, attachment_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="Attachment data is missing")
    filename = (row.original_name or "attachment").replace('"', "")
    return Response(
        content=row.data,
        media_type=row.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

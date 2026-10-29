"""OCR + สร้าง embedding"""
import threading

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services import catalog_ingest, vlm

router = APIRouter(prefix="/ai/catalog", tags=["catalog"])

# สถานะงาน ingest ล่าสุดของแต่ละแคตตาล็อก (เก็บในหน่วยความจำ พอสำหรับเครื่องเดียว)
_jobs: dict[int, dict] = {}
_lock = threading.Lock()


class IngestRequest(BaseModel):
    catalog_id: int
    file_url: str


class ReembedRequest(BaseModel):
    product_ids: list[int]


def _run_ingest(req: IngestRequest):
    job = _jobs[req.catalog_id]

    def on_page(page: int, found: int):
        job["pages_done"] = page
        job["found"] += found

    try:
        job.update(status="done", result=catalog_ingest.ingest(req.catalog_id, req.file_url, on_page))
    except Exception as e:  # noqa: BLE001 — เก็บ error ไว้ให้ดูผ่าน GET
        job.update(status="error", error=str(e))


@router.post("/ingest", status_code=202)
def ingest(req: IngestRequest, background: BackgroundTasks):
    """PDF/รูป → PaddleOCR + Qwen → บันทึกสินค้า (ทำงานเบื้องหลัง ดูสถานะที่ GET /ingest/{catalog_id})"""
    with _lock:
        if _jobs.get(req.catalog_id, {}).get("status") == "running":
            raise HTTPException(409, "แคตตาล็อกนี้กำลังประมวลผลอยู่")
        _jobs[req.catalog_id] = {"status": "running", "pages_done": 0, "found": 0}
    background.add_task(_run_ingest, req)
    return {"status": "queued"}


@router.get("/ingest/{catalog_id}")
def ingest_status(catalog_id: int):
    if catalog_id not in _jobs:
        raise HTTPException(404, "ไม่มีงานของแคตตาล็อกนี้")
    return _jobs[catalog_id]


@router.post("/extract")
def extract(file: UploadFile = File(...)):
    """ทดสอบอ่านไฟล์โดยไม่บันทึก — คืนสินค้าที่อ่านได้ พร้อมรูปลายเป็น data URL"""
    products = catalog_ingest.extract_file(file.file.read(), file.content_type or "")
    out = []
    for p in products:
        swatch = p.pop("_swatch")
        out.append({
            **p,
            "swatch": vlm.image_part(swatch)["image_url"]["url"] if swatch is not None else None,
            "review": p.pop("_review"),
            "page": p.pop("_page"),
        })
    return {"count": len(out), "products": out}


@router.post("/reembed")
def reembed(req: ReembedRequest):
    # TODO: สร้าง embedding (BGE-M3 ข้อความ + OpenCLIP รูป) ของสินค้าเหล่านี้ใหม่
    raise HTTPException(501, "ยังไม่ได้ทำ")

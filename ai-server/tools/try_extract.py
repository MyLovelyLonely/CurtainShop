"""ทดสอบอ่านแคตตาล็อกจากไฟล์ในเครื่อง (ไม่บันทึกลงฐานข้อมูล)

    .venv\Scripts\python -X utf8 -m tools.try_extract path\to\catalog.pdf [out_dir]

พิมพ์ผลเป็น JSON และบันทึกรูปลายที่ตัดได้ไว้ใน out_dir (ค่าเริ่มต้น extract_out/)
"""
import json
import sys
import time
from pathlib import Path

from app.services.catalog_ingest import extract_file


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "extract_out")
    out.mkdir(exist_ok=True)
    t = time.time()
    products = extract_file(
        src.read_bytes(),
        "application/pdf" if src.suffix.lower() == ".pdf" else "",
        on_page=lambda i, n: print(f"หน้า {i}: พบ {n} รายการ ({time.time() - t:.0f}s)", file=sys.stderr),
    )
    for p in products:
        swatch = p.pop("_swatch")
        if swatch is not None:
            path = out / f"{p['details']['code'].replace('/', '_')}.jpg"
            swatch.convert("RGB").save(path)
            p["details"]["images"] = [str(path)]
    print(json.dumps(products, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

r"""ใส่ข้อมูลจาก seed_products.json ลง Supabase ผ่าน API (SUPABASE_URL + service key ใน web/.env.local — project เดียวกับที่เว็บใช้)

รันซ้ำได้: ใช้หมวดหมู่/แคตตาล็อกเดิมถ้าชื่อตรงกัน (ซ้ำหลายแถวใช้ id ต่ำสุด) และข้ามสินค้าที่รหัส (details.code) มีแล้ว
    ai-server\.venv\Scripts\python db\seed\apply_seed.py
ต้องอัปโหลด swatches/*.jpg ขึ้น R2 (seed/swatches/) ก่อน — แล้วสั่งสร้างเวกเตอร์ค้นหา: POST /ai/catalog/reembed {"all": true}
"""
import json
from pathlib import Path

from dotenv import dotenv_values
from supabase import create_client

HERE = Path(__file__).resolve().parent
env = dotenv_values(HERE.parents[1] / "web" / ".env.local")
sb = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])


def id_by_name(table: str, key: str, name: str, row: dict) -> int:
    found = sb.table(table).select(key).eq("name", name).order(key).limit(1).execute().data
    if found:
        return found[0][key]
    return sb.table(table).insert(row).execute().data[0][key]


def main():
    have = {(p["details"] or {}).get("code") for p in sb.table("product").select("details").execute().data}
    added = skipped = 0
    for cat in json.loads((HERE / "seed_products.json").read_text(encoding="utf-8")):
        category_id = id_by_name("category", "category_id", cat["category"], {"name": cat["category"]})
        catalog_id = id_by_name("catalog", "catalog_id", cat["name"], {
            "category_id": category_id, "name": cat["name"], "description": cat["description"], "is_visible": cat["is_visible"],
        })
        new = [p for p in cat["products"] if p["details"]["code"] not in have]
        skipped += len(cat["products"]) - len(new)
        if new:
            sb.table("product").insert([{**p, "catalog_id": catalog_id} for p in new]).execute()
            added += len(new)
        print(f"{cat['name']}: catalog_id={catalog_id} เพิ่ม {len(new)}")
    print(f"เพิ่มสินค้า {added} รายการ, ข้าม (มีแล้ว) {skipped} รายการ")


if __name__ == "__main__":
    main()

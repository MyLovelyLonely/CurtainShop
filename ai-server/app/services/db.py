"""อ่าน/เขียนข้อมูลสินค้าและเวกเตอร์ผ่าน Supabase API — project เดียวกับที่เว็บใช้ (SUPABASE_URL ใน web/.env.local)"""
import json
import threading

import numpy as np
from supabase import Client, create_client

from app.config import SUPABASE_KEY, SUPABASE_URL

PAGE = 1000  # PostgREST คืนได้ครั้งละไม่เกิน 1000 แถว

_client: Client | None = None
_lock = threading.Lock()


def client() -> Client:
    global _client
    with _lock:
        if _client is None:
            if not SUPABASE_URL or not SUPABASE_KEY:
                raise RuntimeError("ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
            _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _client


def _all(make_query) -> list[dict]:
    """ดึงทุกแถว (ทีละหน้า)"""
    out, start = [], 0
    while True:
        rows = make_query().range(start, start + PAGE - 1).execute().data
        out += rows
        if len(rows) < PAGE:
            return out
        start += PAGE


def products(ids: list[int] | None = None, visible_only: bool = False) -> list[dict]:
    """สินค้า + ชื่อแคตตาล็อก (catalog_name) + ชื่อหมวด (category_name)"""
    catalogs = {
        c["catalog_id"]: c for c in _all(lambda: client().table("catalog").select("catalog_id,name,is_visible,category_id"))
    }
    categories = {c["category_id"]: c["name"] for c in _all(lambda: client().table("category").select("category_id,name"))}

    def query():
        q = client().table("product").select("product_id,catalog_id,name,description,details,image_url,base_price").order("product_id")
        return q.in_("product_id", ids) if ids is not None else q

    out = []
    for p in _all(query):
        c = catalogs.get(p["catalog_id"])
        if visible_only and not (c and c["is_visible"]):
            continue
        out.append({**p, "catalog_name": c["name"] if c else None, "category_name": categories.get(c["category_id"]) if c else None})
    return out


def embeddings(kind: str) -> tuple[np.ndarray, np.ndarray]:
    """→ (product_ids, เมทริกซ์เวกเตอร์ n×1024) ของ embedding_type นี้ (pgvector ส่งมาเป็นข้อความ "[0.1,...]")"""
    rows = _all(
        lambda: client().table("vector_embedding").select("product_id,vector_data").eq("embedding_type", kind).order("embedding_id")
    )
    if not rows:
        return np.zeros(0, np.int64), np.zeros((0, 1024), np.float32)
    ids = np.array([r["product_id"] for r in rows], np.int64)
    mat = np.array([json.loads(r["vector_data"]) for r in rows], np.float32)
    return ids, mat


def replace_embeddings(product_ids: list[int], rows: list[dict]):
    """แทนที่เวกเตอร์ของสินค้าเหล่านี้ (rows: product_id, embedding_type, vector_data)
    ใส่ชุดใหม่ก่อนแล้วค่อยลบชุดเดิม — ถ้าใส่ไม่สำเร็จ ของเดิมยังอยู่ ค้นหาได้เหมือนเดิม"""
    old: list[int] = []
    for i in range(0, len(product_ids), 200):
        part = product_ids[i : i + 200]
        old += [r["embedding_id"] for r in _all(
            lambda: client().table("vector_embedding").select("embedding_id").in_("product_id", part).order("embedding_id")
        )]
    for i in range(0, len(rows), 100):
        client().table("vector_embedding").insert(rows[i : i + 100]).execute()
    for i in range(0, len(old), 200):
        client().table("vector_embedding").delete().in_("embedding_id", old[i : i + 200]).execute()

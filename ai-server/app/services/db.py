"""เชื่อม PostgreSQL ของ Supabase ตรง ๆ (psycopg) สำหรับคำสั่งที่ REST ทำไม่ได้ เช่น ค้นเวกเตอร์ด้วย pgvector"""
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.config import PG


@contextmanager
def connect():
    # pooler ของ Supabase ไม่รองรับ prepared statement → ปิด
    with psycopg.connect(**PG, sslmode="require", prepare_threshold=None, connect_timeout=10, row_factory=dict_row) as conn:
        yield conn

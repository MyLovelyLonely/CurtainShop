"""บันทึกคำค้นที่ระบบรับมือไม่ได้ลงไฟล์ ai-server/logs/search_misses.jsonl (ไม่เก็บใน DB — ไม่เพิ่มตาราง)

บันทึกเมื่อ: ไม่เจอสินค้าเลย / ตีความเป็นเงื่อนไขสี-ลาย-การกรองแสงไม่ได้ / ได้เงื่อนไขจากการเทียบความหมาย (ไม่อยู่ในรายการคำ)
แอดมินดูสรุปได้ที่ GET /ai/search/misses แล้วเอาคำที่เจอบ่อยไปเพิ่มใน bm25_rrf (PATTERNS / LIGHTS / CONCEPTS)
"""
import json
import logging
import threading
import time
from collections import Counter

from app.config import LOGS_DIR

log = logging.getLogger(__name__)

FILE = LOGS_DIR / "search_misses.jsonl"
_lock = threading.Lock()


def record(q: str, n_results: int, want: dict, by_meaning: list[str]):
    if n_results == 0:
        reason = "no_results"
    elif by_meaning:
        reason = "by_meaning"
    elif not any(want.get(k) for k in ("colors", "patterns", "lights")):
        reason = "no_filter"
    else:
        return
    row = {
        "t": int(time.time()),
        "q": q,
        "reason": reason,
        "results": n_results,
        "filters": {k: sorted(v) for k, v in want.items() if v},
    }
    try:
        with _lock:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            with FILE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except OSError:  # บันทึกไม่ได้ก็ยังค้นหาได้ตามปกติ
        log.exception("บันทึกคำค้นไม่สำเร็จ")


def misses(limit: int) -> list[dict]:
    """[{q, reason, results, filters, count}] เรียงตามจำนวนครั้งที่ค้น (ผลของครั้งล่าสุดของแต่ละคำ)"""
    try:
        with _lock:
            lines = FILE.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    rows = [json.loads(line) for line in lines if line.strip()]
    count = Counter(r["q"] for r in rows)
    last = {r["q"]: r for r in rows}
    return [
        {**{k: last[q][k] for k in ("q", "reason", "results", "filters")}, "count": n}
        for q, n in count.most_common(limit)
    ]

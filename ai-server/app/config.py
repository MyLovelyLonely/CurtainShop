"""ค่าตั้งค่าจาก .env (ai-server/.env ก่อน แล้วค่อยใช้ค่า Supabase จาก web/.env.local)"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "web" / ".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "catalogs")

# VLM ผ่าน API แบบ OpenAI: ค่าเริ่มต้น = Ollama ในเครื่อง
# ใช้ Hugging Face: VLM_BASE_URL=https://router.huggingface.co/v1, VLM_API_KEY=hf_..., VLM_MODEL=Qwen/Qwen2.5-VL-72B-Instruct:ovhcloud
VLM_BASE_URL = os.getenv("VLM_BASE_URL", "http://localhost:11434/v1")
VLM_API_KEY = os.getenv("VLM_API_KEY") or os.getenv("HF_TOKEN") or "ollama"
VLM_MODEL = os.getenv("VLM_MODEL", "qwen2.5vl:7b")

OCR_LANG = os.getenv("OCR_LANG", "th")

# ด้านยาวสุดของรูปหน้าแคตตาล็อกที่ส่งให้โมเดล (ปัดเป็นทวีคูณ 28 ตาม patch ของ Qwen2.5-VL)
PAGE_MAX_SIDE = int(os.getenv("PAGE_MAX_SIDE", "1288"))

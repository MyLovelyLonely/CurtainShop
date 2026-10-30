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

# ---------- จำลองผ้าม่าน (หัวข้อ 2.5) ----------
# รูปที่ ai-server ยอมโหลด: เฉพาะไฟล์ของร้านเอง (R2 + Supabase Storage) กันการยิง URL ภายนอก
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").rstrip("/")
ALLOWED_IMAGE_PREFIXES = [p for p in (R2_PUBLIC_URL + "/" if R2_PUBLIC_URL else "", SUPABASE_URL.rstrip("/") + "/storage/v1/object/public/" if SUPABASE_URL else "") if p]
# ชั่วคราวช่วงทดสอบจำลอง: รูปผ้าของสินค้าทดสอบใน web/src/services/test-products.ts (ลบพร้อมไฟล์นั้น)
TEST_ASSET_BASE = os.getenv("TEST_ASSET_BASE", "http://localhost:3000").rstrip("/")
ALLOWED_IMAGE_PREFIXES += [
    "https://www.ikea.com/th/th/images/products/",
    "https://encrypted-tbn0.gstatic.com/images?",
    TEST_ASSET_BASE + "/test-swatches/",  # รูปผ้าที่สร้างไว้ใน web/public/test-swatches
]

MODELS_DIR = ROOT / "models"
# ตรวจหน้าต่าง: YOLOE (YOLOv11 แบบระบุคลาสด้วยข้อความ) ใช้ได้เลยไม่ต้องเทรน
# ถ้าเทรน YOLOv11 เองด้วยชุดข้อมูลหน้าต่าง ให้ชี้ WINDOW_MODEL ไปที่ไฟล์ .pt นั้น
WINDOW_MODEL = os.getenv("WINDOW_MODEL", "yoloe-11s-seg.pt")
WINDOW_CONF = float(os.getenv("WINDOW_CONF", "0.15"))
SAM_MODEL = os.getenv("SAM_MODEL", "sam2.1_b.pt")

SD_INPAINT_MODEL = os.getenv("SD_INPAINT_MODEL", "stable-diffusion-v1-5/stable-diffusion-inpainting")
IP_ADAPTER_REPO = os.getenv("IP_ADAPTER_REPO", "h94/IP-Adapter")
IP_ADAPTER_WEIGHT = os.getenv("IP_ADAPTER_WEIGHT", "ip-adapter_sd15.bin")
IP_ADAPTER_SCALE = float(os.getenv("IP_ADAPTER_SCALE", "0.5"))
# strength ต่ำ = คงลายผ้าจากภาพร่างไว้มาก, สูง = ให้ diffusion วาดใหม่มากขึ้น
SD_STRENGTH = float(os.getenv("SD_STRENGTH", "0.4"))
SD_STEPS = int(os.getenv("SD_STEPS", "30"))
SD_SIZE = int(os.getenv("SD_SIZE", "768"))
# false = ไม่ใช้ diffusion (ส่งภาพที่วาดจากลายผ้าจริงกลับไปเลย เร็วและไม่ต้องใช้ GPU)
SIM_REFINE = os.getenv("SIM_REFINE", "true").lower() == "true"
SIM_MAX_SIDE = int(os.getenv("SIM_MAX_SIDE", "1600"))

# ---------- ค้นหาสินค้า (หัวข้อ 2.2–2.3) ----------
# PostgreSQL ของ Supabase (ค่า PG* อยู่ใน web/.env.local) ใช้ pgvector ค้นเวกเตอร์
PG = {
    "host": os.getenv("PGHOST", ""),
    "port": os.getenv("PGPORT", "5432"),
    "dbname": os.getenv("PGDATABASE", "postgres"),
    "user": os.getenv("PGUSER", ""),
    "password": os.getenv("PGPASSWORD", ""),
}
TEXT_EMBED_MODEL = os.getenv("TEXT_EMBED_MODEL", "BAAI/bge-m3")
# OpenCLIP รุ่นที่ตัวเข้ารหัสข้อความรองรับหลายภาษา (รวมภาษาไทย) และได้เวกเตอร์ 1024 มิติเท่าคอลัมน์ vector_data
CLIP_MODEL = os.getenv("CLIP_MODEL", "xlm-roberta-large-ViT-H-14")
CLIP_PRETRAINED = os.getenv("CLIP_PRETRAINED", "frozen_laion5b_s13b_b90k")
# โมเดลค้นหารันบน CPU เป็นค่าเริ่มต้น เพื่อไม่แย่งหน่วยความจำ GPU กับ Stable Diffusion
EMBED_DEVICE = os.getenv("EMBED_DEVICE", "cpu")
# true = ให้ LLM (VLM_MODEL) สกัดเงื่อนไขจากคำค้นเพิ่ม (ช้ากว่าและใช้ GPU) / false = จับคำจากคลังคำในฐานข้อมูล
SEARCH_LLM = os.getenv("SEARCH_LLM", "false").lower() == "true"

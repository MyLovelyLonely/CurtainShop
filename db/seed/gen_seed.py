"""สร้างข้อมูลสินค้าตัวอย่าง (~100 รายการ) → products.csv (ไว้ตรวจ/แก้), seed_products.json (apply_seed.py ใช้ใส่ลง Supabase),
seed_products.sql (สำรอง สำหรับวางใน SQL editor), swatches/*.jpg

แก้ข้อมูลที่ตาราง CATALOGS ด้านล่าง แล้วรันใหม่:
    ai-server\\.venv\\Scripts\\python db\\seed\\gen_seed.py

รูปลายผ้าสร้างด้วยโปรแกรม (swatch.py) URL ในไฟล์ SQL ชี้ไปที่ R2 (<R2_PUBLIC_URL>/seed/swatches/<รหัส>.jpg)
ต้องอัปโหลดโฟลเดอร์ swatches ขึ้น R2 ก่อนรัน SQL
"""
import csv
import json
import os
from pathlib import Path

from swatch import DRAW, save

HERE = Path(__file__).resolve().parent
R2 = os.getenv("R2_PUBLIC_URL", "").rstrip("/")
if not R2:  # อ่านจาก web/.env.local
    for line in (HERE.parents[1] / "web" / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("R2_PUBLIC_URL="):
            R2 = line.split("=", 1)[1].strip().rstrip("/")

LIGHT = {"sheer": "โปร่งแสง", "dimout": "กรองแสงบางส่วน", "blackout": "ทึบแสง"}
PATTERN_TYPE = {
    "plain": "ลายเรียบ (Plain)", "blackout": "ลายเรียบ (Plain)", "sheer": "ลายเรียบ (Plain)",
    "linen": "ลายผ้า/เท็กซ์เจอร์ (Texture)", "herringbone": "ลายผ้า/เท็กซ์เจอร์ (Texture)",
    "stripe": "ลายทาง (Stripe)", "floral": "ลายดอก (Floral)", "leaves": "ลายใบไม้ (Botanical)",
    "damask": "ลายดามัสก์ (Damask)", "medallion": "ลายดามัสก์ (Damask)",
    "chevron": "ลายเรขาคณิต (Geometric)", "check": "ลายเรขาคณิต (Geometric)", "plaid": "ลายเรขาคณิต (Geometric)",
    "stars": "ลายเด็ก (Kids)", "polka": "ลายเด็ก (Kids)",
}
CARE = {
    "machine": "ซักเครื่องโหมดถนอมผ้า น้ำเย็น ห้ามฟอกขาว รีดไฟอ่อน",
    "hand": "ซักมือด้วยน้ำเย็น ห้ามบิด ตากในที่ร่ม",
    "dry": "ซักแห้งเท่านั้น ห้ามซักน้ำ",
    "wipe": "เช็ดทำความสะอาดด้วยผ้าชุบน้ำหมาด ๆ",
}


def line(prefix, start, pattern, pattern_name, name, colorways, *, price, unit="หลา", light, composition, width,
         repeat=None, care="machine", tags=(), desc):
    """ลายเดียวหลายสี (colorway) → รายการสินค้า; colorways = [(ชื่อสีไทย, [สีที่ใช้วาด hex...]), ...]"""
    out = []
    for i, (color_th, hexes) in enumerate(colorways):
        code = f"{prefix}-{start + i:03d}"
        colors = color_th.split("/")
        out.append({
            "code": code, "name": f"{code} {name}{color_th.replace('/', '-')}", "pattern": pattern,
            "pattern_name": pattern_name, "colors": colors, "hexes": hexes, "price": price, "unit": unit,
            "light": light, "composition": composition, "width": width, "repeat": repeat, "care": CARE[care],
            "tags": list(tags), "desc": desc.format(color=color_th.replace("/", "-")),
        })
    return out


def accessory(code, name, price, unit, desc, tags=(), colors=()):
    return {"code": code, "name": f"{code} {name}", "pattern": None, "pattern_name": None, "colors": list(colors),
            "hexes": None, "price": price, "unit": unit, "light": None, "composition": None, "width": None,
            "repeat": None, "care": CARE["wipe"], "tags": list(tags), "desc": desc}


# ---------- แคตตาล็อก: (หมวดหมู่, ชื่อ, คำอธิบาย, แสดงต่อลูกค้า, สินค้า) ----------
# คล้ายกัน: Blackout Collection ↔ Blackout Collection 2026, Linen Natural Vol.1 ↔ Vol.2 (โทนสีซ้อนกันบางส่วน)
CATALOGS = [
    ("ผ้าม่าน", "Blackout Collection", "ผ้าม่านทึบแสง 100% เคลือบกันแสง 3 ชั้น", True,
     line("BK", 102, "blackout", "Plain Blackout", "ผ้าม่านกันแสงสี", [
         ("ขาว", ["#f1eee8"]), ("ครีม", ["#e9dfc9"]), ("เบจ", ["#d6c4a5"]), ("เทา", ["#9a9b9d"]),
         ("เทาเข้ม", ["#55585c"]), ("กรมท่า", ["#24314f"]), ("น้ำตาล", ["#6e5442"]), ("ดำ", ["#26272a"]),
     ], price=1500, unit="ตร.ม.", light="blackout", composition="Polyester 100% เคลือบ 3 ชั้น", width=280,
         tags=["กันแสง", "ห้องนอน", "กันร้อน"],
         desc="ผ้าม่านทึบแสง 100% สี{color} กันแสงแดดและความร้อน เหมาะกับห้องนอนและห้องดูหนัง")),
    ("ผ้าม่าน", "Blackout Collection 2026", "รุ่นปรับปรุงจาก Blackout Collection เนื้อผ้านุ่มขึ้น ทิ้งตัวสวย มีสีใหม่", True,
     line("BK", 201, "linen", "Soft Blackout Linen Look", "ผ้าม่านกันแสงลายลินินสี", [
         ("ขาว", ["#eeeae1"]), ("เบจ", ["#cfbd9d"]), ("เทา", ["#a3a29e"]), ("เขียวเสจ", ["#97a58c"]),
         ("ฟ้าหม่น", ["#8ea3b5"]), ("ชมพูกะปิ", ["#c99c98"]), ("มอคค่า", ["#7b604e"]), ("เทาชาร์โคล", ["#45474b"]),
     ], price=1750, unit="ตร.ม.", light="blackout", composition="Polyester 100% เคลือบ 3 ชั้น ผิวลายลินิน", width=280,
         tags=["กันแสง", "ห้องนอน", "ลุคลินิน", "มาใหม่"],
         desc="ผ้าม่านทึบแสงผิวสัมผัสลายลินินสี{color} ดูเป็นธรรมชาติแต่กันแสงได้เต็มที่")),
    ("ผ้าม่าน", "Linen Natural Vol.1", "ผ้าลินินผสมคอตตอน โทนธรรมชาติ", True,
     line("LN", 101, "linen", "Pure Linen", "ผ้าม่านลินินสี", [
         ("ขาว", ["#efebe2"]), ("ทราย", ["#d8c7a8"]), ("ครีม", ["#e6dbc4"]), ("เขียวเสจ", ["#9fae95"]),
         ("เทาอ่อน", ["#bdbcb6"]), ("น้ำตาลอ่อน", ["#b39a7c"]), ("ฟ้าหม่น", ["#9eb2c2"]), ("เขียวมะกอก", ["#7d7f57"]),
     ], price=650, light="dimout", composition="Linen 55% Cotton 45%", width=280, care="hand",
         tags=["ธรรมชาติ", "มินิมอล"],
         desc="ผ้าลินินแท้สี{color} เนื้อผ้ามีมิติ ระบายอากาศดี ให้ความรู้สึกเป็นธรรมชาติ")),
    ("ผ้าม่าน", "Linen Natural Vol.2", "ภาคต่อของ Linen Natural เพิ่มลายทางและลายก้างปลา", True,
     line("LN", 201, "stripe", "Linen Stripe", "ผ้าม่านลินินลายทาง", [
         ("ขาว/เบจ", ["#efebe2", "#c8b393"]), ("ครีม/น้ำตาล", ["#e6dbc4", "#8b6a4c"]), ("ขาว/เทา", ["#f0eee9", "#8d8e8f"]),
         ("ขาว/กรมท่า", ["#f2efe8", "#25385e"]), ("เขียวเสจ/ครีม", ["#9fae95", "#ece3cf"]),
     ], price=690, light="dimout", composition="Linen 50% Cotton 50%", width=280, repeat=18, care="hand",
         tags=["ธรรมชาติ", "ลายทาง"],
         desc="ลินินทอลายทางแนวตั้งสี{color} ช่วยให้ห้องดูสูงโปร่งขึ้น")
     + line("LN", 251, "herringbone", "Linen Herringbone", "ผ้าม่านลินินลายก้างปลา", [
         ("ทราย/เบจ", ["#cbb998", "#e2d6bd"]), ("เทา/เทาอ่อน", ["#8a8b8c", "#b8b9b9"]), ("น้ำตาล/เบจ", ["#8a7a6a", "#b5a594"]),
     ], price=720, light="dimout", composition="Linen 40% Polyester 60%", width=280, repeat=12,
         tags=["ธรรมชาติ", "คลาสสิก"],
         desc="ลินินทอลายก้างปลาสี{color} ดูภูมิฐาน เหมาะกับห้องทำงาน")),
    ("ผ้าม่าน", "Sheer & Voile", "ผ้าโปร่งบางเบา ใช้คู่กับม่านทึบเป็นม่านสองชั้น", True,
     line("SH", 202, "sheer", "Plain Voile", "ผ้าม่านโปร่งสี", [
         ("ขาว", ["#f6f5f1", "#e9e7e1"]), ("ขาวงาช้าง", ["#f3eee2", "#e5dccb"]), ("เทาอ่อน", ["#dcdcd9", "#c6c6c2"]),
         ("เบจ", ["#e6dccb", "#d2c4ab"]), ("ฟ้าอ่อน", ["#dfe8ef", "#c7d6e2"]), ("ชมพูอ่อน", ["#f2e0df", "#e3c6c4"]),
     ], price=260, light="sheer", composition="Polyester Voile", width=300, care="machine",
         tags=["ผ้าโปร่ง", "เย็นสบาย", "ม่านสองชั้น"],
         desc="ผ้าโปร่งสี{color} แสงส่องผ่านนุ่มนวล ห้องดูสว่างเย็นตา")
     + line("SH", 251, "stripe", "Voile Stripe", "ผ้าม่านโปร่งลายทางสี", [
         ("ขาว", ["#f6f5f1", "#e3e1db"]), ("ครีม", ["#f1eadb", "#ded2b9"]), ("เทา", ["#e2e2df", "#c2c2be"]), ("เบจ", ["#ebe2d2", "#cdbd9f"]),
     ], price=320, light="sheer", composition="Polyester Voile", width=300, repeat=10,
         tags=["ผ้าโปร่ง", "ลายทาง"],
         desc="ผ้าโปร่งทอลายทางเส้นบางสี{color} เพิ่มมิติให้ม่านชั้นใน")),
    ("ผ้าม่าน", "Royal Damask", "ผ้าแจ็คการ์ดลายคลาสสิก เหมาะกับม่านหลุยส์และห้องรับแขก", True,
     line("DM", 501, "damask", "Damask Classic", "ผ้าม่านลายดามัสก์", [
         ("แดงเลือดหมู/ทอง", ["#5e1a24", "#c9a45c"]), ("เทา/เงิน", ["#8d9196", "#d9dce0"]), ("ครีม/ทอง", ["#e8dcc0", "#b8914a"]),
         ("กรมท่า/ทอง", ["#1f2b48", "#c4a35a"]), ("เขียวเข้ม/ทอง", ["#26402f", "#c2a053"]), ("น้ำตาล/ครีม", ["#5b4334", "#e3d3b5"]),
     ], price=890, light="blackout", composition="Jacquard Polyester", width=280, repeat=32, care="dry",
         tags=["หรูหรา", "ม่านหลุยส์", "คลาสสิก"],
         desc="ผ้าแจ็คการ์ดทอลายดามัสก์สี{color} ดูหรูหรา เหมาะกับม่านหลุยส์")
     + line("DM", 551, "medallion", "Royal Medallion", "ผ้าม่านลายเหรียญ", [
         ("ครีม/ทอง", ["#ece2cc", "#b8914a"]), ("แชมเปญ/น้ำตาล", ["#e3d1a6", "#7c5c3c"]), ("เทา/ขาว", ["#9ea1a4", "#eceae6"]),
         ("ม่วง/เงิน", ["#4b3a5c", "#cfcfd6"]),
     ], price=950, light="dimout", composition="Jacquard Polyester", width=280, repeat=40, care="dry",
         tags=["หรูหรา", "คลาสสิก"],
         desc="ผ้าแจ็คการ์ดลายเหรียญวงกลมซ้อนสี{color}")),
    ("ผ้าม่าน", "Botanical Garden", "ลายใบไม้และดอกไม้ โทนธรรมชาติสดชื่น", True,
     line("BT", 301, "leaves", "Falling Leaves", "ผ้าม่านลายใบไม้", [
         ("ครีม/เขียว", ["#efe6d2", "#4f7a52"]), ("เบจ/เขียวมะกอก", ["#c9bfa6", "#6b6b3c"]), ("ขาว/เขียวอ่อน", ["#f4f2ec", "#8fb08a"]),
         ("เขียวเข้ม/ทอง", ["#2f4a3a", "#c9a85c"]), ("ฟ้าอ่อน/กรมท่า", ["#dce6ee", "#2b3f63"]),
     ], price=520, light="dimout", composition="Cotton 60% Polyester 40%", width=280, repeat=64,
         tags=["ธรรมชาติ", "ห้องนั่งเล่น"],
         desc="ลายใบไม้ร่วงสี{color} ให้ความรู้สึกสดชื่นเหมือนอยู่ในสวน")
     + line("FL", 601, "floral", "Blossom", "ผ้าม่านลายดอกไม้", [
         ("ขาว/ชมพู", ["#f7efe9", "#d9798e", "#e9c46a"]), ("ขาว/ฟ้า", ["#fafaf7", "#5b7fb5", "#f1d36b"]),
         ("ครีม/แดง", ["#f1e8d6", "#b33a3f", "#e9c46a"]), ("เหลืองอ่อน/ส้ม", ["#f6edc8", "#e08b45", "#7a4b2a"]),
         ("เขียวมิ้นท์/ขาว", ["#cfe6da", "#ffffff", "#f1d36b"]), ("กรมท่า/ชมพู", ["#22304d", "#e59aa8", "#f1d36b"]),
     ], price=540, light="dimout", composition="Cotton 100%", width=280, repeat=40, care="hand",
         tags=["ลายดอก", "วินเทจ"],
         desc="ลายดอกไม้สี{color} สไตล์วินเทจสดใส")),
    ("ผ้าม่าน", "Modern Geometric", "ลายกราฟิกและลายตาราง สำหรับบ้านสไตล์โมเดิร์น", True,
     line("GE", 401, "chevron", "Chevron", "ผ้าม่านลายซิกแซก", [
         ("เทา/เหลืองมัสตาร์ด", ["#9a9a96", "#d9a441"]), ("ขาว/กรมท่า", ["#f1efe9", "#2a3a5c"]),
         ("เบจ/น้ำตาล", ["#ddcfb3", "#7d5f45"]), ("เทาเข้ม/ขาว", ["#4f5256", "#e9e8e3"]),
     ], price=480, light="dimout", composition="Polyester 100%", width=280, repeat=32,
         tags=["โมเดิร์น", "คอนโด"],
         desc="ลายซิกแซกสี{color} เพิ่มความสนุกให้ห้องสไตล์โมเดิร์น")
     + line("GE", 431, "check", "Gingham Check", "ผ้าม่านลายตาราง", [
         ("ครีม/ฟ้า", ["#ece4d2", "#3a5a8c"]), ("ขาว/แดง", ["#f4f1ec", "#a83236"]), ("ขาว/เขียว", ["#f2f0ea", "#3f6b48"]),
         ("เบจ/น้ำตาล", ["#e3d5ba", "#7b5a3e"]),
     ], price=390, light="dimout", composition="Cotton 100%", width=150, repeat=25, care="machine",
         tags=["คันทรี่", "ห้องครัว"],
         desc="ลายตารางสี{color} สไตล์คันทรี่ เหมาะกับห้องครัวและห้องทานข้าว")
     + line("GE", 461, "plaid", "Tartan", "ผ้าม่านลายสก็อต", [
         ("แดง/เขียว", ["#8e1f24", "#1f4a33", "#e7d9a8"]), ("กรมท่า/เขียว", ["#1e2a46", "#2f5a3f", "#d8c46a"]),
         ("เทา/ดำ", ["#7d7f82", "#2a2b2e", "#c9c9c9"]),
     ], price=590, light="dimout", composition="Wool 20% Polyester 80%", width=150, repeat=32, care="dry",
         tags=["คลาสสิก", "อบอุ่น"],
         desc="ลายสก็อตแทาร์ทันสี{color} ให้ความรู้สึกอบอุ่น")),
    ("ผ้าม่าน", "Kids Fun", "ลายน่ารักสำหรับห้องเด็ก ปลอดภัย ไม่มีสารตะกั่ว", True,
     line("KD", 701, "stars", "Little Stars", "ผ้าม่านลายดาว", [
         ("ฟ้า/เหลือง", ["#9fc9e8", "#fff3b0"]), ("กรมท่า/ขาว", ["#23314f", "#ffffff"]), ("ชมพู/ขาว", ["#f0c6cf", "#ffffff"]),
         ("เทา/เหลือง", ["#a9abae", "#ffe27a"]),
     ], price=420, light="blackout", composition="Polyester เคลือบกันแสง", width=280, repeat=30,
         tags=["ห้องเด็ก", "กันแสง"],
         desc="ลายดาวสี{color} ทึบแสงช่วยให้เด็กนอนกลางวันหลับสบาย")
     + line("KD", 751, "polka", "Polka Dot", "ผ้าม่านลายจุด", [
         ("เขียวมิ้นท์/ขาว", ["#bfe3d0", "#ffffff"]), ("ชมพู/ขาว", ["#f2c4cc", "#ffffff"]), ("เหลือง/ขาว", ["#f6df8f", "#ffffff"]),
         ("ฟ้า/ขาว", ["#a9cfe9", "#ffffff"]),
     ], price=360, light="dimout", composition="Cotton 100%", width=145, repeat=30, care="machine",
         tags=["ห้องเด็ก", "พาสเทล"],
         desc="ลายจุดน่ารักสี{color}")),
    ("ผ้าม่าน", "Clearance 2024", "สินค้าลดราคาล้างสต็อก (ซ่อนจากลูกค้า ใช้ทดสอบ is_visible)", False,
     line("CL", 901, "plain", "Old Stock Plain", "ผ้าม่านล้างสต็อกสี", [
         ("ส้ม", ["#d9773b"]), ("ม่วง", ["#6a4c80"]), ("เขียว", ["#4f8a5b"]),
     ], price=199, light="dimout", composition="Polyester 100%", width=280, tags=["ลดราคา"],
         desc="ผ้าม่านสี{color} รุ่นเก่า ลดราคาล้างสต็อก")
     + line("CL", 951, "stripe", "Old Stock Stripe", "ผ้าม่านลายทางล้างสต็อก", [
         ("แดง/ขาว", ["#f3efe8", "#b33a3f"]), ("เหลือง/ขาว", ["#f3efe8", "#e0b43c"]), ("ฟ้า/ขาว", ["#f3efe8", "#4f86b8"]),
     ], price=249, light="dimout", composition="Cotton 100%", width=150, repeat=18, tags=["ลดราคา"],
         desc="ผ้าลายทางสี{color} รุ่นเก่า ลดราคาล้างสต็อก")),
    ("อุปกรณ์ผ้าม่าน", "อุปกรณ์ติดตั้ง", None, True, [
        accessory("RL-02", "รางม่านอลูมิเนียมสำหรับม่านจีบ", 950, "เมตร", "รางอลูมิเนียมพร้อมลูกล้อ เลื่อนลื่น ไม่มีเสียง", ["ราง"], ["ขาว"]),
        accessory("RL-03", "รางโชว์ไม้สักหัวกลม", 1800, "ชุด", "รางไม้สักขนาด 28 มม. พร้อมหัวรางทรงกลมและขาจับ", ["ราง", "ไม้"], ["น้ำตาล"]),
        accessory("RL-04", "รางโค้งสำหรับหน้าต่างเบย์", 2400, "ชุด", "รางดัดโค้งตามมุมหน้าต่างแบบเบย์ (bay window)", ["ราง", "หน้าต่างเบย์"], ["เงิน"]),
        accessory("RD-01", "ราวม่านสแตนเลส 1.5 ม.", 690, "ชุด", "ราวสแตนเลสพร้อมห่วงและขาจับ ยาว 1.5 เมตร", ["ราว"], ["เงิน"]),
        accessory("HK-01", "ตะขอผ้าม่าน (แพ็ค 50 ชิ้น)", 120, "แพ็ค", "ตะขอสแตนเลสสำหรับม่านจีบ กันสนิม", ["ตะขอ"], ["เงิน"]),
        accessory("TB-01", "สายรวบม่านพู่", 250, "คู่", "สายรวบผ้าม่านแบบพู่ สำหรับม่านหลุยส์", ["ที่รวบ", "ม่านหลุยส์"], ["ทอง"]),
        accessory("TB-02", "ที่รวบม่านสแตนเลส", 390, "คู่", "ขอรวบม่านติดผนัง สแตนเลสขัดเงา", ["ที่รวบ"], ["เงิน"]),
        accessory("MT-01", "มอเตอร์ม่านไฟฟ้า", 6500, "ชุด", "มอเตอร์ม่านจีบไฟฟ้า สั่งงานผ่านแอปและรีโมท", ["ม่านไฟฟ้า", "สมาร์ทโฮม"], ["ขาว"]),
        accessory("RM-01", "รีโมทม่านไฟฟ้า 5 ช่อง", 890, "ชิ้น", "รีโมทควบคุมม่านไฟฟ้าได้ 5 ชุด", ["ม่านไฟฟ้า"], ["ขาว"]),
    ]),
]


def sql_str(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    swatch_dir = HERE / "swatches"
    swatch_dir.mkdir(exist_ok=True)
    rows, sql = [], [
        "-- ข้อมูลสินค้าตัวอย่าง: สร้างจาก db/seed/gen_seed.py (แก้ที่สคริปต์แล้วรันใหม่ ไม่แก้ไฟล์นี้ตรง ๆ)",
        "-- รันซ้ำได้: ข้ามหมวดหมู่/แคตตาล็อกที่ชื่อซ้ำ และสินค้าที่รหัส (details->>'code') ซ้ำ",
        "-- ต้องอัปโหลด db/seed/swatches/*.jpg ไปที่ R2: seed/swatches/ ก่อน",
        "begin;",
    ]
    for cat_name in dict.fromkeys(c[0] for c in CATALOGS):
        sql.append(f"insert into category (name) select {sql_str(cat_name)} where not exists (select 1 from category where name = {sql_str(cat_name)});")
    seed, catalogs_json = 0, []
    for cat_name, name, desc, visible, products in CATALOGS:
        cat_json = {"category": cat_name, "name": name, "description": desc, "is_visible": visible, "products": []}
        catalogs_json.append(cat_json)
        sql.append(
            f"insert into catalog (category_id, name, description, is_visible) select (select category_id from category where name = {sql_str(cat_name)} order by category_id limit 1), "
            f"{sql_str(name)}, {sql_str(desc)}, {'true' if visible else 'false'} where not exists (select 1 from catalog where name = {sql_str(name)});"
        )
        for p in products:
            seed += 1
            img = None
            if p["hexes"]:
                DRAW_FN = DRAW[p["pattern"]]
                save(DRAW_FN(p["hexes"], seed), str(swatch_dir / f"{p['code']}.jpg"))
                img = f"{R2}/seed/swatches/{p['code']}.jpg"
            details = {
                "code": p["code"], "collection": name, "pattern_name": p["pattern_name"],
                "pattern_type": PATTERN_TYPE.get(p["pattern"]) if p["pattern"] else None,
                "colors": p["colors"], "composition": p["composition"], "width_cm": p["width"], "repeat_cm": p["repeat"],
                "light_filter": p["light"], "tags": p["tags"], "care": p["care"], "images": [img] if img else [],
                # ฟิลด์สำหรับ FlowAccount (ตามข้อมูลเดิม)
                "type": 3, "unit_name": p["unit"], "sell_account_code": "41101",
            }
            cat_json["products"].append({"name": p["name"], "base_price": p["price"], "price_unit": p["unit"],
                                         "description": p["desc"], "image_url": img, "details": details})
            sql.append(
                "insert into product (catalog_id, name, base_price, price_unit, description, image_url, details) select "
                f"(select catalog_id from catalog where name = {sql_str(name)} order by catalog_id limit 1), {sql_str(p['name'])}, {p['price']}, "
                f"{sql_str(p['unit'])}, to_jsonb({sql_str(p['desc'])}::text), {sql_str(img)}, {sql_str(json.dumps(details, ensure_ascii=False))}::jsonb "
                f"where not exists (select 1 from product where details->>'code' = {sql_str(p['code'])});"
            )
            rows.append({
                "แคตตาล็อก": name, "แสดงต่อลูกค้า": "ใช่" if visible else "ซ่อน", "หมวดหมู่": cat_name, "รหัส": p["code"],
                "ชื่อสินค้า": p["name"], "ประเภทลาย": details["pattern_type"] or "", "ชื่อลาย": p["pattern_name"] or "",
                "สี": ", ".join(p["colors"]), "การกรองแสง": LIGHT.get(p["light"], ""), "ราคา": p["price"], "หน่วย": p["unit"],
                "หน้ากว้าง (ซม.)": p["width"] or "", "ระยะซ้ำลาย (ซม.)": p["repeat"] or "", "ส่วนประกอบ": p["composition"] or "",
                "การดูแลรักษา": p["care"], "แท็ก": ", ".join(p["tags"]), "รายละเอียด": p["desc"], "รูป": f"swatches/{p['code']}.jpg" if img else "",
            })
    sql.append("commit;")
    (HERE / "seed_products.sql").write_text("\n".join(sql) + "\n", encoding="utf-8")
    (HERE / "seed_products.json").write_text(json.dumps(catalogs_json, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(HERE / "products.csv", "w", encoding="utf-8-sig", newline="") as f:  # BOM ให้ Excel อ่านภาษาไทยได้
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(CATALOGS)} แคตตาล็อก, {len(rows)} สินค้า, รูป {sum(1 for r in rows if r['รูป'])} รูป")


if __name__ == "__main__":
    main()

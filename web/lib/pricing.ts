// สูตรคำนวณราคาต่อรายการ ใช้ร่วมกันทั้งหน้า LIFF, ฟอร์มแอดมิน และ API ให้ราคาตรงกันทุกที่

// ============================================================
// บล็อก 1: จัดกลุ่มหน่วย → เลือกสูตร
// ============================================================
const AREA_UNITS = ["ตร.ม.", "ตารางเมตร"]; // ผ้าม่าน   → กว้าง × สูง
const YARD_UNITS = ["หลา"];                // ผ้าม่าน   → รอร้านยืนยันสูตร (ดู yardQty)
const LENGTH_UNITS = ["เมตร"];             // อุปกรณ์   → กว้าง
// หน่วยอื่นทั้งหมด (ชิ้น / ชุด / อัน ...) = ซื้อมาขายไป → จำนวน

export type PriceMode = "area" | "yard" | "length" | "piece";

export function priceMode(priceUnit: string | null | undefined): PriceMode {
  const u = (priceUnit ?? "").trim();
  if (AREA_UNITS.includes(u)) return "area";
  if (YARD_UNITS.includes(u)) return "yard";
  if (LENGTH_UNITS.includes(u)) return "length";
  return "piece";
}

// ผ้าม่าน (ตร.ม. / หลา): ต้องกรอกกว้าง × สูง
export const isAreaUnit = (u: string | null | undefined) => ["area", "yard"].includes(priceMode(u));
// อุปกรณ์ (เมตร): ต้องกรอกกว้างอย่างเดียว
export const isLengthUnit = (u: string | null | undefined) => priceMode(u) === "length";
// ต้องกรอกขนาดไหม (ไม่ใช่สินค้าคิดเป็นชิ้น)
export const usesSize = (u: string | null | undefined) => priceMode(u) !== "piece";

// ============================================================
// บล็อก 2: สูตรแต่ละแบบ (qty = จำนวนบาน / จำนวนชิ้น)
// ============================================================
const r2 = (n: number) => Math.round(n * 100) / 100;

// 2.1 ผ้าม่าน (ตร.ม.):        กว้าง × สูง × จำนวนบาน
const areaQty = (w: number, h: number, qty: number) => r2(w * h * qty);

// 2.2 ผ้าม่าน (หลา):          TODO รอร้านยืนยันสูตร
//     ถามร้าน: "หน้าต่าง 2 × 1.5 ม. ผ้า 500/หลา คิดลูกค้าเท่าไหร่?"
//     ตอนนี้ใช้สูตรเดียวกับ ตร.ม. ไปก่อน ราคาจะได้ไม่เป็น 0
const yardQty = (w: number, h: number, qty: number) => {
  return areaQty(w, h, qty);
};

// 2.3 อุปกรณ์ (เมตร):         กว้าง × จำนวนบาน
const lengthQty = (w: number, qty: number) => r2(w * qty);

// 2.4 ซื้อมาขายไป (ชิ้น/ชุด):  จำนวน
const pieceQty = (qty: number) => qty;

// ============================================================
// บล็อก 3: ฟังก์ชันที่หน้าอื่นเรียกใช้
// ============================================================
type Line = { width?: number | string | null; height?: number | string | null; quantity: number | string; unit_price: number | string };

// จำนวนที่ใช้คิดเงิน: ตร.ม.รวม / เมตรรวม / จำนวนชิ้น
export function billedQuantity(line: Line, priceUnit: string | null | undefined) {
  const w = Number(line.width ?? 0);
  const h = Number(line.height ?? 0);
  const qty = Number(line.quantity);
  switch (priceMode(priceUnit)) {
    case "area":   return areaQty(w, h, qty);
    case "yard":   return yardQty(w, h, qty);
    case "length": return lengthQty(w, qty);
    case "piece":  return pieceQty(qty);
  }
}

// ราคารวมของรายการ = จำนวนที่คิดเงิน × ราคาต่อหน่วย
export function lineTotal(line: Line, priceUnit: string | null | undefined) {
  return r2(billedQuantity(line, priceUnit) * Number(line.unit_price));
}

// พื้นที่รวม / ความยาวรวม (ไว้แสดงผล) หรือ null ถ้าคิดเป็นชิ้น
export function lineArea(line: Line, priceUnit: string | null | undefined) {
  return usesSize(priceUnit) ? billedQuantity(line, priceUnit) : null;
}

// ============================================================
// บล็อก 4: ตรวจค่าที่กรอก (Use Case 12: กรอกไม่ครบไม่บันทึก)
// ============================================================
export function missingSize(line: Line, priceUnit: string | null | undefined) {
  const w = Number(line.width);
  const h = Number(line.height);
  switch (priceMode(priceUnit)) {
    case "area":
    case "yard":   return !(w > 0 && h > 0); // ต้องมีกว้างและสูง
    case "length": return !(w > 0);          // ต้องมีกว้าง
    case "piece":  return false;             // ไม่ต้องกรอกขนาด
  }
}

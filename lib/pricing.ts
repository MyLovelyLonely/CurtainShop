// สูตรคำนวณราคาต่อรายการ ใช้ร่วมกันทั้งหน้า LIFF, ฟอร์มแอดมิน และ API ให้ราคาตรงกันทุกที่
//   ผ้าม่าน (ตร.ม.) = กว้าง x สูง x จำนวนหน้าต่าง x ราคา/ตร.ม.
//   อุปกรณ์ (ชิ้น/ชุด) = จำนวน x ราคา/หน่วย

const AREA_UNITS = ["ตร.ม.", "ตารางเมตร"];

export const isAreaUnit = (priceUnit: string | null | undefined) => AREA_UNITS.includes((priceUnit ?? "").trim());

const r2 = (n: number) => Math.round(n * 100) / 100;

type Line = { width?: number | string | null; height?: number | string | null; quantity: number | string; unit_price: number | string };

// พื้นที่รวมของรายการ (ตร.ม.) หรือ null ถ้าเป็นสินค้าคิดเป็นชิ้น
export function lineArea(line: Line, priceUnit: string | null | undefined) {
  if (!isAreaUnit(priceUnit)) return null;
  return r2(Number(line.width ?? 0) * Number(line.height ?? 0) * Number(line.quantity));
}

// จำนวนที่ใช้คิดเงิน: ตร.ม. รวม หรือ จำนวนชิ้น
export function billedQuantity(line: Line, priceUnit: string | null | undefined) {
  return lineArea(line, priceUnit) ?? Number(line.quantity);
}

export function lineTotal(line: Line, priceUnit: string | null | undefined) {
  return r2(billedQuantity(line, priceUnit) * Number(line.unit_price));
}

// ผ้าม่านต้องมีกว้างและสูงมากกว่า 0 (Use Case 12: กรอกไม่ครบไม่บันทึก)
export function missingSize(line: Line, priceUnit: string | null | undefined) {
  return isAreaUnit(priceUnit) && !(Number(line.width) > 0 && Number(line.height) > 0);
}

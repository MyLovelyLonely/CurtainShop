// คำนวณใบเสนอราคา + สร้าง body ของ FlowAccount ใช้ร่วมกันตอนสร้าง (POST) และแก้ไข (PUT) ใบเสนอราคา
//   แอดมินแก้ได้แค่ กว้าง / สูง / จำนวนหน้าต่างต่อห้อง (Use Case 12)
//   สินค้า ราคาต่อหน่วย (base_price) จำนวนห้อง และมัดจำ 50% ระบบกำหนดเอง
import "server-only";
import { contactFields, r2, today, VAT_RATE } from "./documents";
import { billedQuantity, isAreaUnit, lineTotal, missingSize } from "./pricing";

const DEPOSIT_RATE = 0.5; // มัดจำ 50% ของยอดรวม

// แถวสินค้าจากฐานข้อมูล (price_estimate_item หรือ quotation_item join product)
export type SourceRow = {
  id: number; product_id: number; width: string | number | null; height: string | number | null; quantity: number;
  name: string; base_price: string | number; price_unit: string; product_details: Record<string, unknown> | null;
};
export type SizeEdit = { width?: number | null; height?: number | null; quantity?: number };

export type PricedItem = ReturnType<typeof priceItems>["items"][number];

// รวมค่าที่แอดมินแก้เข้ากับแถวเดิม แล้วคำนวณยอด คืน error ถ้าข้อมูลไม่ครบ (Use Case 12 Alternate Flow)
export function priceItems(rows: SourceRow[], edits: Map<number, SizeEdit>, roomCount: number) {
  const items = rows.map((row) => {
    const edit = edits.get(row.id);
    // อุปกรณ์ (หน่วยชุด/ชิ้น) ไม่ใช้กว้าง x สูง เก็บเป็นค่าว่าง
    const area = isAreaUnit(row.price_unit);
    const width = !area ? null : edit && edit.width !== undefined ? edit.width : row.width === null ? null : Number(row.width);
    const height = !area ? null : edit && edit.height !== undefined ? edit.height : row.height === null ? null : Number(row.height);
    const windows = Number(edit?.quantity ?? row.quantity); // จำนวนหน้าต่างต่อห้อง
    const line = { width, height, quantity: windows, unit_price: Number(row.base_price) };
    const roomTotal = lineTotal(line, row.price_unit); // ยอดต่อ 1 ห้อง
    return { ...line, id: row.id, windows, product_id: row.product_id, product: row, roomTotal, total: r2(roomTotal * roomCount) };
  });

  const badQty = items.filter((i) => !Number.isInteger(i.windows) || i.windows < 1);
  if (badQty.length) {
    return { items, error: `จำนวนหน้าต่างต้องเป็นจำนวนเต็มตั้งแต่ 1: ${badQty.map((i) => i.product.name).join(", ")}` };
  }
  const noSize = items.filter((i) => missingSize(i, i.product.price_unit));
  if (noSize.length) {
    return { items, error: `กรุณากรอกกว้างและสูงให้ครบ: ${noSize.map((i) => i.product.name).join(", ")}` };
  }

  // ทุกห้องใช้รูปแบบเดียวกัน ยอดรวม = (รวมทุกสินค้าต่อห้อง) x จำนวนห้อง
  const roomSubTotal = r2(items.reduce((sum, i) => sum + i.roomTotal, 0));
  const subTotal = r2(roomSubTotal * roomCount);
  const vatAmount = r2(subTotal * VAT_RATE);
  const grandTotal = r2(subTotal + vatAmount);
  const depositAmount = r2(grandTotal * DEPOSIT_RATE);
  return { items, error: null, roomSubTotal, subTotal, vatAmount, grandTotal, depositAmount };
}

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

// body ใบเสนอราคาของ FlowAccount (สร้าง = SimpleDocument, แก้ไข = UpdateSimpleDocument + recordId)
export function faQuotationBody(p: {
  recordId?: number; customer: Record<string, string | null>; projectName: string | null; reference: string;
  roomCount: number; items: PricedItem[]; roomSubTotal: number; subTotal: number; vatAmount: number; grandTotal: number;
}) {
  return {
    recordId: p.recordId ?? 0,
    documentStructureType: p.recordId ? "UpdateSimpleDocument" : "SimpleDocument",
    ...contactFields(p.customer),
    publishedOn: today(),
    projectName: p.projectName ?? "",
    reference: p.reference,
    // FlowAccount ไม่มีบรรทัดคูณจำนวนห้อง รายการด้านบนจึงรวมทุกห้องแล้ว แจ้งยอดต่อห้องไว้ในหมายเหตุ
    remarks: p.roomCount > 1
      ? `ราคาต่อ 1 ห้อง ${money(p.roomSubTotal)} บาท x ${p.roomCount} ห้อง = ${money(p.subTotal)} บาท (ก่อน VAT)`
      : "",
    isVatInclusive: false, //required
    isVat: true, //required
    subTotal: p.subTotal, //required
    discountAmount: 0,
    totalAfterDiscount: p.subTotal,
    vatAmount: p.vatAmount,
    grandTotal: p.grandTotal, //required
    items: p.items.map((i) => ({ //required
      type: (i.product.product_details?.type as number) ?? 3,
      name: i.product.name,
      // ผ้าม่าน: quantity ใน FlowAccount = ตร.ม. รวม ให้ quantity x pricePerUnit = total
      description: isAreaUnit(i.product.price_unit)
        ? `${i.width} x ${i.height} ม. x ${i.windows} หน้าต่าง` + (p.roomCount > 1 ? ` x ${p.roomCount} ห้อง` : "")
        : "",
      // FlowAccount ไม่มีตัวคูณห้อง จึงรวมห้องเข้าไปในจำนวนของแต่ละรายการ
      quantity: r2(billedQuantity(i, i.product.price_unit) * p.roomCount),
      unitName: isAreaUnit(i.product.price_unit)
        ? i.product.price_unit
        : (i.product.product_details?.unit_name as string) ?? i.product.price_unit,
      pricePerUnit: i.unit_price,
      total: i.total,
    })),
  };
}

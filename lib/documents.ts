// ตัวช่วยที่ใช้ร่วมกันตอนสร้างเอกสาร FlowAccount (ใบแจ้งหนี้ / ใบกำกับภาษี / ใบเสร็จ)

export const VAT_RATE = 0.07;

// เลขประเภทเอกสารของ FlowAccount ใช้ใน documentReference ตอน upgrade
export const FA_DOC_TYPE = { quotation: 3, billingNote: 5, taxInvoice: 7 } as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;

// yyyy-MM-dd ตามเวลาไทย
export const today = (addDays = 0) =>
  new Date(Date.now() + addDays * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

// ข้อมูลลูกค้าบนเอกสาร จากสำเนาที่เก็บไว้ใน quotation.details.customer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function contactFields(c: any) {
  return {
    contactName: c.name, // required
    contactAddress: c.address ?? "",
    contactNumber: c.phone ?? "",
    contactEmail: c.email ?? "",
    contactZipCode: c.zip_code ?? "",
    contactTaxId: c.tax_id ?? "",
    contactBranch: c.branch ?? "",
    contactGroup: c.tax_id ? 3 : 1,
  };
}

// ยอดของใบแจ้งหนี้/ใบกำกับภาษี/ใบเสร็จ เป็นยอดรวม VAT แล้ว (มาจาก quotation.total_amount)
// จึงส่งแบบ isVatInclusive แล้วแยก VAT ออกมา (× 7/107) เป็นรายการเดียว
export function amountFields(amount: number, itemName: string) {
  return {
    isVatInclusive: true, // required
    isVat: true, // required
    subTotal: amount, // required
    discountAmount: 0,
    totalAfterDiscount: amount, // required
    vatAmount: r2((amount * VAT_RATE) / (1 + VAT_RATE)),
    grandTotal: amount, // required
    items: [{ type: 3, name: itemName, quantity: 1, unitName: "งาน", pricePerUnit: amount, total: amount }], // required
  };
}

// FlowAccount ตอบสำเร็จหรือไม่ คืนเอกสารที่ได้ (มี recordId, documentSerial)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function faDoc(fa: { status: number; data: any }) {
  const doc = fa.data?.data;
  return fa.status === 200 && fa.data?.status && doc?.recordId ? doc : null;
}

// ข้อมูลร้าน (ผู้ขาย) ที่พิมพ์บนใบสัญญาซื้อขาย ตั้งค่าใน .env.local
export const SHOP = {
  name: process.env.SHOP_NAME ?? "ร้านผ้าม่าน",
  address: process.env.SHOP_ADDRESS ?? "",
  phone: process.env.SHOP_PHONE ?? "",
  taxId: process.env.SHOP_TAX_ID ?? "",
};

// เลขที่สัญญา เช่น CT2026-0001
export const contractNo = (c: { contract_id: number; created_at: string | Date }) =>
  `CT${new Date(c.created_at).getFullYear()}-${String(c.contract_id).padStart(4, "0")}`;

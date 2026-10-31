// ใบสัญญาซื้อขาย (Use Case 15 ข้อ 3, Data Dictionary ตารางที่ 3-34) ใช้ร่วมกันฝั่งแอดมินและ LIFF
//   ไม่มีคอลัมน์สถานะ: ดูจากคอลัมน์ที่มีอยู่
//     signed_file_url ว่าง                 = รอลูกค้าเซ็น (หรือแอดมินตีกลับให้ส่งใหม่)
//     signed_file_url มีค่า, signed_at ว่าง = ลูกค้าส่งไฟล์ที่เซ็นแล้ว รอแอดมินตรวจ
//     signed_at มีค่า                      = แอดมินยืนยันใบสัญญาที่เซ็นแล้ว
//   เหตุผลที่แอดมินตีกลับเก็บใน quotation.details.contract_reject = { note, at } (แบบเดียวกับ change_request)

export type ContractStatus = "waiting_sign" | "waiting_review" | "confirmed";

export function contractStatus(c: { signed_file_url: string | null; signed_at: string | Date | null }): ContractStatus {
  if (c.signed_at) return "confirmed";
  if (c.signed_file_url) return "waiting_review";
  return "waiting_sign";
}

// ป้ายสถานะฝั่งแอดมิน [ข้อความ, สี Badge]
export const CONTRACT_BADGE = {
  waiting_sign: ["รอลูกค้าเซ็น", "amber"],
  waiting_review: ["ลูกค้าส่งแล้ว รอตรวจสอบ", "blue"],
  confirmed: ["ยืนยันแล้ว", "emerald"],
} as const;

export const MAX_UPLOAD_MB = 4; // Vercel รับ request ได้ ~4.5MB

// อ่านไฟล์จากฟอร์ม ตรวจชนิด/ขนาด คืน { body, contentType, ext } หรือ { error }
export async function readUpload(form: FormData, field: string, allowed: Record<string, string>) {
  const file = form.get(field);
  if (!(file instanceof File) || !file.size) return { error: "กรุณาเลือกไฟล์" } as const;
  const ext = allowed[file.type];
  if (!ext) return { error: "รูปแบบไฟล์ไม่ถูกต้อง" } as const;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return { error: `ไฟล์ต้องไม่เกิน ${MAX_UPLOAD_MB} MB` } as const;
  return { body: Buffer.from(await file.arrayBuffer()), contentType: file.type, ext } as const;
}

export const PDF_ONLY = { "application/pdf": "pdf" };
export const PDF_OR_IMAGE = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

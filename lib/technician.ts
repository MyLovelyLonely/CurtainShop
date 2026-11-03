export type TechnicianInput = { name: string; phone: string; line_id: string | null };

export function parseTechnicianInput(input: unknown): { values?: TechnicianInput; error?: string } {
  if (!input || typeof input !== "object") return { error: "ข้อมูลช่างไม่ถูกต้อง" };
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/[-\s]/g, "") : "";
  const line = typeof body.line_id === "string" ? body.line_id.trim() : "";

  if (!name) return { error: "กรุณากรอกชื่อช่าง" };
  if (name.length > 100) return { error: "ชื่อช่างยาวเกิน 100 ตัวอักษร" };
  if (!/^0\d{8,9}$/.test(phone)) return { error: "เบอร์โทรต้องเป็นตัวเลข 9-10 หลักขึ้นต้นด้วย 0" };
  if (line.length > 100) return { error: "LINE ต้องไม่เกิน 100 ตัวอักษร" };

  return { values: { name, phone, line_id: line || null } };
}

// เรียก FlowAccount Open API ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
import "server-only";
import { mockFlowAccount } from "./flowaccount-mock";

const BASE_URL = process.env.FLOWACCOUNT_BASE_URL!;

// เอกสารที่ใช้ในโปรเจค (ใบแจ้งหนี้ = billing-notes)
export const DOC_TYPES = ["quotations", "billing-notes", "tax-invoices", "receipts"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value);
}

// เก็บ token ไว้ใช้ซ้ำจนกว่าจะหมดอายุ
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: process.env.FLOWACCOUNT_SCOPE ?? "flowaccount-api",
      client_id: process.env.FLOWACCOUNT_CLIENT_ID ?? "",
      client_secret: process.env.FLOWACCOUNT_CLIENT_SECRET ?? "",
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`ขอ token ไม่สำเร็จ (${res.status}): ${data.error ?? JSON.stringify(data)}`);
  }

  // ลบ 60 วิ กันหมดอายุระหว่างใช้งาน
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

// ยิง request ไป FlowAccount แล้วคืน status + body ตามที่ได้มา
export async function flowAccount(method: string, path: string, body?: unknown) {
  if (process.env.FLOWACCOUNT_MOCK === "true") return mockFlowAccount(method, path, body);

  const token = await getToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ลิงก์หน้าเอกสารที่ลูกค้าเปิดดู/ดาวน์โหลดได้โดยไม่ต้องล็อกอิน (POST /{docType}/sharedocument)
export async function shareLink(docType: DocType, recordId: number): Promise<string | null> {
  const { status, data } = await flowAccount("POST", `/${docType}/sharedocument`, { documentId: recordId, culture: "th" });
  return status === 200 && data?.status ? data.data?.link ?? null : null;
}

// ไฟล์ PDF ต้นฉบับ (POST /{docType}/{id}/export-pdf/base64) ไม่สำเร็จ = null
export async function exportPdf(docType: DocType, recordId: number): Promise<Buffer | null> {
  const { status, data } = await flowAccount("POST", `/${docType}/${recordId}/export-pdf/base64`, {
    culture: "th",
    document: { original: true, copy: false },
  });
  return status === 200 && data?.status && typeof data.data === "string" ? Buffer.from(data.data, "base64") : null;
}

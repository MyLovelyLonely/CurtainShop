// Stripe PromptPay (หัวข้อ 2.8) เรียก REST API ตรง ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
import "server-only";
import crypto from "crypto";

// อายุ QR ที่ระบบกำหนดเอง (Use Case 9 A1.1 "ภายในระยะเวลาที่กำหนด") ครบแล้วยกเลิก PaymentIntent
export const QR_EXPIRES_SECONDS = Number(process.env.STRIPE_QR_EXPIRES_SECONDS) || 600;

type Intent = { id: string; status: string; created: number; qr_image: string | null };

async function stripe(method: string, path: string, params?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${data.error?.message ?? res.status}`);
  return data;
}

const toIntent = (pi: { id: string; status: string; created: number; next_action?: { promptpay_display_qr_code?: { image_url_svg?: string } } }): Intent => ({
  id: pi.id,
  status: pi.status,
  created: pi.created,
  qr_image: pi.next_action?.promptpay_display_qr_code?.image_url_svg ?? null,
});

// สร้าง QR PromptPay ตามยอด (บาท) metadata ใช้ผูกกลับตอน webhook
export async function createPromptPay(amount: number, metadata: Record<string, string>, email?: string): Promise<Intent> {
  const params: Record<string, string> = {
    amount: String(Math.round(amount * 100)), // หน่วยสตางค์
    currency: "thb",
    // Stripe เลิกรับ payment_method_types แล้ว: ระบุ promptpay ผ่าน payment_method_data
    // และปิด redirect (PromptPay ไม่ต้องพาลูกค้าออกจากหน้า เลยไม่ต้องมี return_url)
    "payment_method_data[type]": "promptpay",
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
    confirm: "true",
  };
  if (email) params["payment_method_data[billing_details][email]"] = email;
  for (const [k, v] of Object.entries(metadata)) params[`metadata[${k}]`] = v;
  return toIntent(await stripe("POST", "/payment_intents", params));
}

export async function getIntent(id: string): Promise<Intent> {
  return toIntent(await stripe("GET", `/payment_intents/${id}`));
}

export async function cancelIntent(id: string) {
  await stripe("POST", `/payment_intents/${id}/cancel`).catch(() => {}); // จ่ายแล้วหรือยกเลิกไปแล้ว = ไม่เป็นไร
}

export const expiresAt = (intent: Intent) => new Date((intent.created + QR_EXPIRES_SECONDS) * 1000);

// ตรวจลายเซ็น webhook (header Stripe-Signature: t=...,v1=...) กันคนยิงปลอม
export function verifyWebhook(rawBody: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false; // เก่ากว่า 5 นาที
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return parts.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

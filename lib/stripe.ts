// Stripe PromptPay (หัวข้อ 2.8) ผ่าน Stripe SDK ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
//   ทุก route เรียก Stripe ผ่านไฟล์นี้ (สร้าง / ดู / ยกเลิก QR และตรวจลายเซ็น webhook)
import "server-only";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

// อายุ QR ที่ระบบกำหนดเอง (Use Case 9 A1.1 "ภายในระยะเวลาที่กำหนด") ครบแล้วยกเลิก PaymentIntent
export const QR_EXPIRES_SECONDS = Number(process.env.STRIPE_QR_EXPIRES_SECONDS) || 600;

type Intent = { id: string; status: string; created: number; qr_image: string | null };

const toIntent = (pi: Stripe.PaymentIntent): Intent => ({
  id: pi.id,
  status: pi.status,
  created: pi.created,
  qr_image: pi.next_action?.promptpay_display_qr_code?.image_url_svg ?? null,
});

// สร้าง QR PromptPay ตามยอด (บาท) metadata ใช้ผูกกลับตอน webhook
//   PromptPay บังคับต้องมีอีเมลลูกค้า (Stripe ใช้ติดต่อตอนคืนเงิน) ไม่มี = Stripe ตอบ error
export async function createPromptPay(amount: number, metadata: Record<string, string>, email?: string): Promise<Intent> {
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // หน่วยสตางค์
    currency: "thb",
    // ระบุ promptpay ผ่าน payment_method_data และปิด redirect (PromptPay ไม่ต้องพาลูกค้าออกจากหน้า เลยไม่ต้องมี return_url)
    payment_method_data: { type: "promptpay", ...(email && { billing_details: { email } }) },
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    confirm: true,
    metadata,
  });
  return toIntent(pi);
}

export async function getIntent(id: string): Promise<Intent> {
  return toIntent(await stripe.paymentIntents.retrieve(id));
}

export async function cancelIntent(id: string) {
  await stripe.paymentIntents.cancel(id).catch(() => {}); // จ่ายแล้วหรือยกเลิกไปแล้ว = ไม่เป็นไร
}

export const expiresAt = (intent: Intent) => new Date((intent.created + QR_EXPIRES_SECONDS) * 1000);

// ตรวจลายเซ็น webhook (header Stripe-Signature) กันคนยิงปลอม
//   SDK ตรวจ HMAC-SHA256 ของ body ดิบ และไม่รับถ้าเก่ากว่า 5 นาที (ค่าเริ่มต้น) ให้เอง
export function verifyWebhook(rawBody: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  try {
    stripe.webhooks.constructEvent(rawBody, header, secret);
    return true;
  } catch {
    return false;
  }
}

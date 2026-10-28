// Stripe PromptPay (หัวข้อ 2.8) เรียก REST API ตรง ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
// STRIPE_MOCK=true = จำลอง QR (ยังไม่มีบัญชี Stripe) แอดมิน/ผู้ทดสอบกด "จำลองว่าชำระแล้ว" แทนการสแกน
import "server-only";
import crypto from "crypto";

// อายุ QR ที่ระบบกำหนดเอง (Use Case 9 A1.1 "ภายในระยะเวลาที่กำหนด") ครบแล้วยกเลิก PaymentIntent
export const QR_EXPIRES_SECONDS = Number(process.env.STRIPE_QR_EXPIRES_SECONDS) || 600;

export const isStripeMock = () => process.env.STRIPE_MOCK === "true";

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
  if (isStripeMock()) {
    const created = Math.floor(Date.now() / 1000);
    const id = `pi_mock_${created}_${crypto.randomBytes(4).toString("hex")}`;
    return { id, status: "requires_action", created, qr_image: mockQrSvg(id) };
  }
  const params: Record<string, string> = {
    amount: String(Math.round(amount * 100)), // หน่วยสตางค์
    currency: "thb",
    "payment_method_types[]": "promptpay",
    "payment_method_data[type]": "promptpay",
    confirm: "true",
  };
  if (email) params["payment_method_data[billing_details][email]"] = email;
  for (const [k, v] of Object.entries(metadata)) params[`metadata[${k}]`] = v;
  return toIntent(await stripe("POST", "/payment_intents", params));
}

export async function getIntent(id: string): Promise<Intent> {
  if (isStripeMock()) {
    const created = Number(id.split("_")[2]);
    return { id, status: "requires_action", created, qr_image: mockQrSvg(id) };
  }
  return toIntent(await stripe("GET", `/payment_intents/${id}`));
}

export async function cancelIntent(id: string) {
  if (isStripeMock()) return;
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

// รูป QR จำลอง (สแกนไม่ได้) หน้าตาเหมือน QR จริงไว้ demo
function mockQrSvg(seed: string) {
  const n = 25;
  const hash = crypto.createHash("sha256").update(seed).digest();
  const bit = (i: number) => (hash[i % hash.length] >> (i % 8)) & 1;
  // มุมสี่เหลี่ยม 3 มุมแบบ QR จริง: คืน true/false ถ้าอยู่ในมุม, undefined ถ้าไม่ใช่
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const dx = x - fx, dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      }
    }
    return undefined;
  };
  let rects = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (finder(x, y) ?? bit(y * n + x * 7)) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

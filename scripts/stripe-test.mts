// ทดสอบสร้าง QR PromptPay จริงจาก Stripe (test mode) แล้วยกเลิกทิ้ง: npx tsx --env-file=.env.local scripts/stripe-test.mts
//   ใช้ params ชุดเดียวกับ createPromptPay ใน lib/stripe.ts (import ตรงไม่ได้เพราะไฟล์นั้นเป็น server-only)
async function stripe(method: string, path: string, params?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${data.error?.message ?? res.status}`);
  return data;
}

const pi = await stripe("POST", "/payment_intents", {
  amount: "10000", // 100 บาท
  currency: "thb",
  "payment_method_data[type]": "promptpay",
  "payment_method_data[billing_details][email]": "test@example.com",
  confirm: "true",
  "automatic_payment_methods[enabled]": "true",
  "automatic_payment_methods[allow_redirects]": "never",
  "metadata[test]": "stripe-test.mts",
});
const qr = pi.next_action?.promptpay_display_qr_code;
console.log("สร้าง PaymentIntent:", pi.id, pi.status, `${pi.amount / 100} ${pi.currency}`, pi.livemode ? "LIVE" : "test mode");
console.log("รูป QR (SVG):", qr?.image_url_svg ? "ได้" : "ไม่ได้");
console.log("หน้าคำแนะนำ / จำลองจ่าย:", qr?.hosted_instructions_url);

const cancelled = await stripe("POST", `/payment_intents/${pi.id}/cancel`);
console.log("ยกเลิกแล้ว:", cancelled.status);

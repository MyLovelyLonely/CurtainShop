// ดูสถานะ PaymentIntent + ลิงก์จำลองจ่าย (test mode): npx tsx --env-file=.env.local scripts/stripe-intent.mts <pi_id>
const res = await fetch(`https://api.stripe.com/v1/payment_intents/${process.argv[2]}`, {
  headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
});
const pi = await res.json();
console.log(pi.id, pi.status, `${pi.amount / 100} ${pi.currency}`);
console.log("ลิงก์จำลองจ่าย:", pi.next_action?.promptpay_display_qr_code?.hosted_instructions_url ?? "-");

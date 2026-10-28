// ข้อมูลฝั่งลูกค้า: ทุก query กรองด้วย customer_id ของคนที่ login เท่านั้น
import "server-only";
import { pool } from "./db";

// ใบแจ้งหนี้ของลูกค้า + สถานะชำระ + QR ที่ค้างอยู่ (ถ้ามี)
const INVOICE_SQL = `
  select i.invoice_id, i.type, i.amount, i.due_date, i.flowaccount_serial,
         q.quotation_id, q.flowaccount_serial as qt_serial, q.total_amount, q.details->>'project_name' as project_name,
         exists (select 1 from payment p where p.invoice_id = i.invoice_id and p.status = 'paid') as is_paid,
         (select p.payment_id from payment p where p.invoice_id = i.invoice_id and p.status = 'pending'
          and p.pay_method = 'qr_code' order by p.payment_id desc limit 1) as pending_payment_id
  from invoice i
  join quotation q using (quotation_id)
  join price_estimate e using (estimate_id)
  where e.customer_id = $1`;

export async function customerInvoices(customerId: number) {
  const r = await pool.query(`${INVOICE_SQL} order by i.due_date, i.invoice_id`, [customerId]);
  return r.rows;
}

export async function customerInvoice(customerId: number, invoiceId: number) {
  const r = await pool.query(`${INVOICE_SQL} and i.invoice_id = $2`, [customerId, invoiceId]);
  return r.rows[0] ?? null;
}

// ประวัติการชำระเงิน (Use Case 10) เรียงตามวันที่ชำระล่าสุดก่อน
export async function customerPaymentHistory(customerId: number) {
  const r = await pool.query(
    `select p.payment_id, p.amount, p.pay_method, p.paid_at, i.type, i.flowaccount_serial as inv_serial,
            q.flowaccount_serial as qt_serial, r.flowaccount_serial as receipt_serial, t.flowaccount_serial as tax_serial
     from payment p
     join invoice i using (invoice_id)
     join quotation q using (quotation_id)
     join price_estimate e using (estimate_id)
     left join receipt r using (payment_id)
     left join tax_invoice t using (payment_id)
     where e.customer_id = $1 and p.status = 'paid'
     order by p.paid_at desc`,
    [customerId],
  );
  return r.rows;
}

// payment ของลูกค้าคนนี้เท่านั้น
export async function customerPayment(customerId: number, paymentId: number) {
  const r = await pool.query(
    `select p.* from payment p
     join invoice i using (invoice_id) join quotation q using (quotation_id) join price_estimate e using (estimate_id)
     where p.payment_id = $1 and e.customer_id = $2`,
    [paymentId, customerId],
  );
  return r.rows[0] ?? null;
}

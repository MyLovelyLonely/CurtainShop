/**
 * แจ้งเตือนลูกค้าผ่าน LINE Official Account (LINE Messaging API) ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * 1.3.6 ระบบแจ้งเตือนสถานะ สามารถ
 * 1.3.6.1 แสดงความคืบหน้าของงานและเอกสารทางการเงินผ่าน LINE Official Account
 * 1.3.6.2 แจ้งเตือนสถานะต่าง ๆ ไปยังลูกค้าผ่าน LINE Official Account เช่น การออกใบ
 * แจ้งหนี้ (สถานะงาน,การเงิน,เอกสาร)
 *
 * แหล่งอ้างอิง (LINE Developers)
 * [A] Push message API      https://developers.line.biz/en/reference/messaging-api/#send-push-message
 * [B] Channel access token  https://developers.line.biz/en/docs/basics/channel-access-token/
 * [C] Flex Message          https://developers.line.biz/en/docs/messaging-api/using-flex-messages/
 * [D] Flex Message elements https://developers.line.biz/en/docs/messaging-api/flex-message-elements/
 * [E] URI action            https://developers.line.biz/en/reference/messaging-api/#uri-action
 * [F] เปิด LIFF ด้วยลิงก์    https://developers.line.biz/en/docs/liff/opening-liff-app/
 */
import "server-only";
import { pool } from "./db";

// ส่งข้อความหาลูกค้า 1 คน (Push message [A])
//   to       = LINE User ID ของลูกค้า (customer.line_user_id)
//   messages = ข้อความ ส่งได้ไม่เกิน 5 ข้อความต่อครั้ง [A]
export async function sendLineMessage(to: string, messages: object[]) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, // [B]
    },
    body: JSON.stringify({ to, messages }),
  });
  // ไม่สำเร็จ LINE ตอบ JSON บอกสาเหตุ เช่น token ผิด / ลูกค้ายังไม่แอดเพื่อน [A]
  if (!res.ok) throw new Error(`LINE push ${res.status}: ${await res.text()}`);
}

// ลิงก์เปิดหน้าใน LIFF: https://liff.line.me/{LIFF ID}/{path} ต่อ path ท้าย Endpoint URL (/liff) [F]
function liffUrl(path: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  return liffId ? `https://liff.line.me/${liffId}/${path}` : null;
}

const baht = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

// การ์ด Flex แบบ bubble [C][D]: หัวข้อ / รายการ "ชื่อ: ค่า" / ปุ่มเปิด LIFF (ถ้ามี)
function flexCard(altText: string, title: string, rows: [string, string][], button?: { label: string; url: string | null }) {
  return {
    type: "flex",
    altText, // ข้อความที่ขึ้นในแจ้งเตือนและรายการแชท [C]
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: title, weight: "bold", size: "lg", wrap: true },
          ...rows.map(([label, value]) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: label, size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: value, size: "sm", wrap: true, flex: 3 },
            ],
          })),
        ],
      },
      ...(button?.url && {
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "button", style: "primary", action: { type: "uri", label: button.label, uri: button.url } }, // [E]
          ],
        },
      }),
    },
  };
}

// ส่งการ์ด แต่ส่งไม่สำเร็จจะไม่ทำให้งานหลักล้ม (บันทึก DB ไปแล้ว แค่ log ไว้)
async function notify(lineUserId: string | null, message: object) {
  if (!lineUserId) return; // ลูกค้ายังไม่เคยเข้า LIFF = ไม่มี LINE User ID
  try {
    await sendLineMessage(lineUserId, [message]);
  } catch (e) {
    console.error("แจ้งเตือน LINE ไม่สำเร็จ:", (e as Error).message);
  }
}

// แจ้งเตือนการสร้างใบเสนอราคา (มีใบเสนอราคาเข้า) Activity Diagram 3-4 "แจ้งเตือนลูกค้าผ่าน LINE OA"
export async function notifyQuotationCreated(quotationId: number) {
  const r = await pool.query(
    `select q.quotation_id, q.total_amount, q.deposit_amount, c.line_user_id
     from quotation q join price_estimate e using (estimate_id) join customer c using (customer_id)
     where q.quotation_id = $1`,
    [quotationId],
  );
  const q = r.rows[0];
  if (!q) return;

  await notify(q.line_user_id, flexCard(
    `มีใบเสนอราคาใหม่ #${q.quotation_id}`,
    "มีใบเสนอราคาใหม่",
    [
      ["เลขที่", `#${q.quotation_id}`],
      ["ยอดรวม", `${baht(q.total_amount)} บาท`],
      ["มัดจำ", `${baht(q.deposit_amount)} บาท`],
    ],
    { label: "ตรวจสอบใบเสนอราคา", url: liffUrl(`documents/quotations/${q.quotation_id}`) },
  ));
}

// ชื่อสถานะงานตาม Data Dictionary ตารางที่ 3-35 (Job)
const JOB_STATUS: Record<string, string> = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  completed: "ดำเนินการเสร็จสิ้น",
  closed: "ปิดงาน",
};

// แจ้งเตือนสถานะงาน (งานเปลี่ยนสถานะตาม job ตั้งแต่สถานะแรก) Use Case 21 ข้อ 5, ขอบเขต 1.3.5
export async function notifyJobStatus(jobId: number) {
  const r = await pool.query(
    `select j.job_id, j.status, c.line_user_id
     from job j join quotation q using (quotation_id) join price_estimate e using (estimate_id) join customer c using (customer_id)
     where j.job_id = $1`,
    [jobId],
  );
  const job = r.rows[0];
  if (!job) return;

  const status = JOB_STATUS[job.status] ?? job.status;
  await notify(job.line_user_id, flexCard(
    `งาน #${job.job_id}: ${status}`,
    "อัปเดตสถานะงาน",
    [
      ["งาน", `#${job.job_id}`],
      ["สถานะ", status],
    ],
    { label: "ดูสถานะงาน", url: liffUrl("jobs") },
  ));
}

// แจ้งเตือนการออกใบแจ้งหนี้ (มัดจำ/ยอดคงเหลือ) ขอบเขต 1.3.6.2, Activity Diagram 3-4/3-5 "แจ้งเตือนลูกค้าผ่าน LINE OA"
export async function notifyInvoiceIssued(invoiceId: number) {
  const r = await pool.query(
    `select i.invoice_id, i.type, i.amount, i.due_date, i.flowaccount_serial, c.line_user_id
     from invoice i join quotation q using (quotation_id) join price_estimate e using (estimate_id) join customer c using (customer_id)
     where i.invoice_id = $1`,
    [invoiceId],
  );
  const invoice = r.rows[0];
  if (!invoice) return;

  const label = invoice.type === "deposit" ? "ค่ามัดจำ" : "ยอดคงเหลือ";
  await notify(invoice.line_user_id, flexCard(
    `ใบแจ้งหนี้${label} ${baht(invoice.amount)} บาท`,
    `ใบแจ้งหนี้${label}`,
    [
      ["เลขที่", invoice.flowaccount_serial],
      ["ยอดชำระ", `${baht(invoice.amount)} บาท`],
      ["ครบกำหนด", new Date(invoice.due_date).toLocaleDateString("th-TH", { dateStyle: "medium" })],
    ],
    { label: "ชำระเงิน", url: liffUrl(`payments/${invoice.invoice_id}`) },
  ));
}

// แจ้งเตือนการออกใบเสร็จรับเงิน ขอบเขต 1.3.6.2, Activity Diagram 3-4/3-5 "ออกใบเสร็จรับเงิน"
export async function notifyReceiptIssued(receiptId: number) {
  const r = await pool.query(
    `select r.flowaccount_serial, p.amount, i.type, c.line_user_id
     from receipt r join payment p using (payment_id) join invoice i using (invoice_id)
       join quotation q using (quotation_id) join price_estimate e using (estimate_id) join customer c using (customer_id)
     where r.receipt_id = $1`,
    [receiptId],
  );
  const receipt = r.rows[0];
  if (!receipt) return;

  const label = receipt.type === "deposit" ? "ค่ามัดจำ" : "ยอดคงเหลือ";
  await notify(receipt.line_user_id, flexCard(
    `ออกใบเสร็จ${label}แล้ว`,
    "ออกใบเสร็จรับเงินแล้ว",
    [
      ["เลขที่", receipt.flowaccount_serial],
      ["รายการ", label],
      ["ยอดเงิน", `${baht(receipt.amount)} บาท`],
    ],
    { label: "ดูใบเสร็จ", url: liffUrl("documents") },
  ));
}
//ใบกำกับภาษีแจ้งเฉพาะคนที่ขอ (note details-> ขอ)
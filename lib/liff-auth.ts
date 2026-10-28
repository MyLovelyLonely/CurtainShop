// ระบุตัวลูกค้าจาก LINE ID token (Use Case 1) ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
// หน้า LIFF ส่ง ID token มาใน header Authorization: Bearer <token>
// เซิร์ฟเวอร์ตรวจ token กับ LINE แล้วใช้ sub (LINE User ID) หาลูกค้า ห้ามเชื่อ customer_id ที่หน้าเว็บส่งมา
// LIFF_MOCK=true (ยังไม่มี LIFF ID) = ใช้ลูกค้าทดสอบ LIFF_MOCK_LINE_USER_ID หรือลูกค้าคนแรก
import "server-only";
import { NextResponse } from "next/server";
import { pool } from "./db";

export type Customer = {
  customer_id: number; line_user_id: string; display_name: string;
  full_name: string | null; phone: string | null; address: string | null; details: Record<string, string>;
};

async function verifyIdToken(idToken: string) {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: process.env.LINE_LOGIN_CHANNEL_ID ?? "" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sub ? { lineUserId: data.sub as string, name: (data.name as string) ?? "ลูกค้า LINE" } : null;
}

// คืนข้อมูลลูกค้า หรือ null ถ้ายืนยันตัวตนไม่ได้; ลูกค้าใหม่ = สร้างให้อัตโนมัติ
export async function currentCustomer(req: Request): Promise<Customer | null> {
  if (process.env.LIFF_MOCK === "true") {
    const r = process.env.LIFF_MOCK_LINE_USER_ID
      ? await pool.query(`select * from customer where line_user_id = $1`, [process.env.LIFF_MOCK_LINE_USER_ID])
      : await pool.query(`select * from customer order by customer_id limit 1`);
    return r.rows[0] ?? null;
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const line = await verifyIdToken(token);
  if (!line) return null;

  const r = await pool.query(
    `insert into customer (line_user_id, display_name) values ($1, $2)
     on conflict (line_user_id) do update set display_name = excluded.display_name
     returning *`,
    [line.lineUserId, line.name],
  );
  return r.rows[0];
}

export const unauthorized = () => NextResponse.json({ error: "ไม่สามารถเข้าสู่ระบบได้" }, { status: 401 });

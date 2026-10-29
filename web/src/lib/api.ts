// ตัวช่วยสำหรับ Route Handler

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const jsonError = (status: number, message: string) =>
  Response.json({ error: message }, { status });

/** ห่อ handler: ให้ทำงานทุก request (ไม่ prerender ตอน build) และแปลง error เป็น JSON response */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    await connection();
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof HttpError) return jsonError(e.status, e.message);
      console.error(e);
      return jsonError(500, e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };
}

export function parseId(value: string | null | undefined, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} ไม่ถูกต้อง`);
  return n;
}

/**
 * แปลง error จาก supabase เป็น HttpError แล้วคืน data
 * (ไม่มี error = select/single ได้ data เสมอ ยกเว้น maybeSingle ที่ผู้เรียกต้องเช็ก null เอง)
 */
export function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    if (res.error.code === "23503")
      throw new HttpError(409, "ข้อมูลนี้ถูกอ้างอิงอยู่ในเอกสารอื่น (เช่น ใบประเมิน/ใบเสนอราคา) จึงลบไม่ได้");
    throw new Error(res.error.message);
  }
  return res.data as NonNullable<T>;
}

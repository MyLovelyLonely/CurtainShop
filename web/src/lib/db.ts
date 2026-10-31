// supabase-js ฝั่งเซิร์ฟเวอร์ (ใช้ secret key ข้าม RLS) ห้าม import จาก Client Component

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

const PAGE = 1000; // Supabase (PostgREST) คืนได้ครั้งละไม่เกิน 1,000 แถว — ดึงครั้งเดียวแถวเกินจะหายเงียบ ๆ

/** ดึงทุกแถวทีละหน้า: page(from, to) ต้องเป็น query ที่ order แน่นอนแล้วต่อด้วย .range(from, to) */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** แบ่งรายการเป็นชุดย่อย: เงื่อนไข .in(...) ส่งไปใน URL รายการยาวเกินจะ error */
export const chunks = <T>(xs: T[], size = 200): T[][] =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));

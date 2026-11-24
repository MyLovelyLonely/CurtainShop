import "server-only";
import pg from "pg";

// pg อ่าน PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD จาก .env.local ให้เอง
const globalForPg = globalThis as unknown as { pgPool?: pg.Pool };

export const pool =
  globalForPg.pgPool ??
  new pg.Pool({
    ssl: { rejectUnauthorized: false }, // Supabase บังคับ SSL
    max: 3,                             // สายสูงสุดต่อ instance
    idleTimeoutMillis: 60_000,
  });

// ตอน dev ไม่ให้สร้าง pool ใหม่ทุกครั้งที่แก้ไฟล์
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
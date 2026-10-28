import pg from 'pg'
const { Pool } = pg

// เก็บ pool ไว้ใน globalThis กันโหมด dev สร้าง pool ใหม่ทุกครั้งที่แก้ไฟล์
const globalForPg = globalThis as unknown as { pgPool?: pg.Pool }

function createPool() {
  const pool = new Pool({
    ssl: { rejectUnauthorized: false },
    // เปิด connection ใหม่ไป Supabase ใช้ ~0.5 วิ เลยถือ connection ที่ว่างไว้ 1 นาที (ค่าเดิม 10 วิ)
    // นานกว่านี้ Supabase/เครือข่ายตัดสายเงียบ ๆ แล้วได้ ECONNRESET ตอนหยิบมาใช้
    idleTimeoutMillis: 60 * 1000,
    keepAlive: true, // ส่ง TCP keep-alive กันสายที่ว่างถูกตัด
  })
  // สายที่ว่างอยู่หลุดเอง: pool ทิ้งสายนั้นแล้วเปิดใหม่ให้ ไม่ต้องให้ server ล่ม
  pool.on('error', (err) => console.warn('pg idle client error:', err.message))
  return pool
}

export const pool = globalForPg.pgPool ?? createPool()

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool

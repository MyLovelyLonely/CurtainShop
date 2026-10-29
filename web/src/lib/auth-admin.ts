// ตรวจ session แอดมิน (JWT HS256 ใน cookie admin_session)

import { cookies } from "next/headers";
import { HttpError } from "./api";

export const ADMIN_COOKIE = "admin_session";

export type AdminSession = { admin_id: number; username: string };

const enc = new TextEncoder();

function b64urlDecode(s: string) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function verifyJwt(token: string, secret: string): Promise<AdminSession | null> {
  const [header, payload, sig] = token.split(".");
  if (!header || !payload || !sig) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), enc.encode(`${header}.${payload}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
  return { admin_id: claims.admin_id, username: claims.username };
}

/** ใช้ใน /api/admin/* — throw 401 ถ้ายังไม่ล็อกอิน */
export async function requireAdmin(): Promise<AdminSession> {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    // ช่วงพัฒนา ยังไม่มีระบบล็อกอิน: ปล่อยผ่านเฉพาะ dev
    if (process.env.NODE_ENV !== "production") return { admin_id: 0, username: "dev" };
    throw new HttpError(500, "ยังไม่ได้ตั้งค่า ADMIN_JWT_SECRET");
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const session = token ? await verifyJwt(token, secret) : null;
  if (!session) throw new HttpError(401, "กรุณาเข้าสู่ระบบแอดมิน");
  return session;
}

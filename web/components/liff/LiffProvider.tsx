"use client";
// เริ่ม LIFF ครั้งเดียวแล้วแชร์ฟังก์ชันเรียก API ที่แนบ ID token ให้ทุกหน้า
// ไม่ได้ตั้ง NEXT_PUBLIC_LIFF_ID = โหมดทดสอบในเบราว์เซอร์ธรรมดา (เซิร์ฟเวอร์ใช้ LIFF_MOCK)
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

// path = URL ของ API เช่น "/api/liff/me"
// init = ตัวเลือกของ fetch (method, body, headers) ไม่เกี่ยวกับ liff.init / ไม่ใส่ = GET
// T    = ชนิดข้อมูลที่ API คืนมา ใส่ตอนเรียก เช่น api<Me>("/api/liff/me")
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
const LiffContext = createContext<Api | null>(null);

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(!LIFF_ID);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!LIFF_ID) return;
    import("@line/liff").then(async ({ default: liff }) => {
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) return liff.login(); // เปิดนอกแอป LINE = ไปหน้า login ของ LINE
      // LIFF คืน ID token ที่แคชไว้แม้หมดอายุแล้ว (อายุ ~1 ชม.) = LINE verify ไม่ผ่าน ต้อง login ใหม่ให้ได้ token ใหม่
      const exp = liff.getDecodedIDToken()?.exp;
      if (exp && exp * 1000 < Date.now()) { //token line หน่วยเปนวิ แต่ js เปน มิลลี
        liff.logout();
        return liff.login({ redirectUri: location.href });
      }
      setToken(liff.getIDToken());
      setReady(true);
    }).catch(() => setError(true));
  }, []);

  // useCallback: ใช้ฟังก์ชัน api ตัวเดิมจนกว่า token จะเปลี่ยน
  // กัน useEffect ที่มี [api] รันซ้ำทุกครั้งที่หน้า render (ยิง API วนไม่จบ)
  const api: Api = useCallback(async (path, init) => {
    // 1. ยิง API พร้อมแนบ token
    const res = await fetch(path, {
      ...init, // method, body ที่หน้าที่เรียกส่งมา (ไม่ส่ง = GET)
      headers: {
        // ส่งไฟล์ (FormData) → ไม่ใส่ เพราะเบราว์เซอร์ต้องใส่ "multipart/form-data; boundary=..." เอง
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        // มี token → แนบไปให้ server verify กับ LINE / ไม่มี (โหมดทดสอบ) → ไม่แนบ
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // header อื่นที่หน้าที่เรียกส่งมาเอง (ถ้ามี)
        ...init?.headers,
      },
    });

    // 2. อ่านผลลัพธ์ (server ไม่ได้ตอบเป็น JSON → ใช้ {} แทน จะได้ไม่พังตรงนี้)
    const data = await res.json().catch(() => ({}));

    // 3. server ตอบ error → โยน error ให้หน้าที่เรียกจัดการ
    if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    return data;
  }, [token]);

  if (error) return <Center>ไม่สามารถเข้าสู่ระบบได้</Center>;
  if (!ready) return <Center>กำลังเข้าสู่ระบบ...</Center>;
  return <LiffContext.Provider value={api}>{children}</LiffContext.Provider>;
}

export function useApi() {
  const api = useContext(LiffContext);
  if (!api) throw new Error("useApi ต้องอยู่ใน LiffProvider");
  return api;
}

// โหลดข้อมูลจาก API พร้อมสถานะ loading / error
export function useLiffData<T>(path: string) {
  const api = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<T>(path).then(setData, (e: Error) => setError(e.message));
  }, [api, path]);

  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[60vh] flex items-center justify-center text-lg text-muted-foreground px-6 text-center">{children}</div>;
}
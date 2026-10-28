"use client";
// เริ่ม LIFF ครั้งเดียว (Use Case 1) แล้วแชร์ฟังก์ชันเรียก API ที่แนบ ID token ให้ทุกหน้า
// ไม่ได้ตั้ง NEXT_PUBLIC_LIFF_ID = โหมดทดสอบในเบราว์เซอร์ธรรมดา (เซิร์ฟเวอร์ใช้ LIFF_MOCK)
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

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
      setToken(liff.getIDToken());
      setReady(true);
    }).catch(() => setError(true));
  }, []);

  const api: Api = useCallback(async (path, init) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
    const data = await res.json().catch(() => ({}));
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

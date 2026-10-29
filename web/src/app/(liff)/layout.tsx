// หน้าลูกค้าเปิดใน LINE (LIFF) — ออกแบบสำหรับจอมือถือ

export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col bg-background">{children}</div>;
}

// หน้าโหลด (โครงเทาๆ) แสดงทันทีตอนกดเปลี่ยนหน้า/เปลี่ยน tab ระหว่างรอ query ฐานข้อมูล
// ใช้เป็น loading.tsx ของทุกโฟลเดอร์ใน app/admin (Next 16 instant navigation)
export default function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-9 w-64 rounded-lg bg-muted" />
      <div className="h-5 w-96 max-w-full rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-muted" />)}
      </div>
      <div className="h-64 rounded-2xl bg-muted" />
    </div>
  );
}

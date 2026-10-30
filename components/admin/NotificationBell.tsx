"use client";
// กระดิ่งแจ้งเตือนแอดมิน (Use Case 22)
//   ดึง /api/admin/notifications ทุก 30 วินาที (งานที่รอแอดมินจัดการ)
//   เลขวงแดง = รายการที่เข้ามาหลังเปิดกระดิ่งครั้งล่าสุด, กดเปิด = เลขหาย
//   เวลาที่เปิดล่าสุดเก็บใน browser (localStorage) แยกตามเครื่อง
//   กดรายการ = ไปหน้าที่ต้องจัดการ (UC 22 ข้อ 4 แอดมินเปิดดูรายละเอียด)
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { thDate } from "@/components/admin/ui";

type Notification = { message: string; link: string; at: string };

const SEEN_KEY = "admin_notifications_seen_at";

function readSeenAt() {
  try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; }
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(""); // เปิดกระดิ่งล่าสุดเมื่อไหร่ ("" = ไม่เคยเปิด)
  const [newSince, setNewSince] = useState(""); // ใช้ทำจุดสีฟ้าในรายการที่กำลังเปิดดู

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/notifications").catch(() => null);
      if (!res?.ok) return;
      setItems((await res.json()).notifications);
      setSeenAt(readSeenAt());
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  // ใหม่ = เกิดหลังเวลาที่เปิดกระดิ่งล่าสุด
  const isNew = (n: Notification, since: string) => !since || new Date(n.at) > new Date(since);
  const unread = items.filter((n) => isNew(n, seenAt)).length;

  function toggle() {
    if (!open) {
      // เปิดกระดิ่ง = ถือว่าเห็นแล้ว จำเวลานี้ไว้ เลขวงแดงจึงหาย
      const now = new Date().toISOString();
      setNewSince(seenAt);
      setSeenAt(now);
      try { localStorage.setItem(SEEN_KEY, now); } catch {}
    }
    setOpen(!open);
  }

  return (
    <div className="relative">
      <button onClick={toggle} aria-label={`แจ้งเตือนใหม่ ${unread} รายการ`}
        className="relative p-2 rounded-xl hover:bg-muted">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-50">
          <p className="px-4 py-3 border-b border-border font-semibold">แจ้งเตือน ({items.length})</p>
          {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">ไม่มีแจ้งเตือน</p>}
          {items.map((n, i) => (
            <Link key={i} href={n.link} onClick={() => setOpen(false)}
              className="flex gap-2 px-4 py-3 border-b border-border last:border-0 hover:bg-muted">
              {/* จุดสีฟ้า = รายการใหม่ตั้งแต่เปิดครั้งก่อน */}
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isNew(n, newSince) ? "bg-blue-500" : ""}`} />
              <div>
                <p className="text-sm">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{thDate(n.at, true)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

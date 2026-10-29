import Link from "next/link";

const NAV = [
  ["/admin/dashboard", "แดชบอร์ด"],
  ["/admin/catalogs", "แคตตาล็อก"],
  ["/admin/estimates", "ใบประเมิน"],
  ["/admin/quotations", "ใบเสนอราคา"],
  ["/admin/documents", "เอกสาร"],
  ["/admin/jobs", "งาน"],
  ["/admin/technicians", "ช่าง"],
  ["/admin/customers", "ลูกค้า"],
  ["/admin/faq", "FAQ"],
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-3">
          <Link href="/admin/dashboard" className="shrink-0 font-semibold text-brand">
            Curtain Shop · Admin
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="shrink-0 rounded-md px-2.5 py-1.5 text-stone-600 hover:bg-stone-100">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { Panel } from "@/components/liff/ui";

// หน้าแคตตาล็อก (เพื่อนกำลังทำ) มีทางลัดไปหน้าสรุปราคา / ใบประเมินราคา
export default function LiffCatalog() {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">แคตตาล็อก</h1>
        <Link href="/liff/estimate" aria-label="ใบสรุปราคา" title="ใบสรุปราคา"
          className="rounded-lg p-2 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 2.75h8l4.25 4.5v14H5.75v-18.5H6Z" fill="#1c1410" stroke="#1c1410" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M14 3v4.5h4M9 11h6M9 14.5h6M9 18h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
      <Panel className="text-center py-12 text-base text-muted-foreground">
        กำลังพัฒนา<br /><span className="text-sm">(Use Case 2–5 ค้นหาสินค้า จำลองสินค้า ประเมินราคา)</span>
      </Panel>
    </>
  );
}

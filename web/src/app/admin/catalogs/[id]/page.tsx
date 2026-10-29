import { Suspense } from "react";
import CatalogEditor from "./CatalogEditor";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-stone-400">กำลังโหลด…</p>}>
      <CatalogEditor />
    </Suspense>
  );
}

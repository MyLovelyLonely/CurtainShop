import { Suspense } from "react";
import ProductDetail from "./ProductDetail";

export default function Page() {
  return (
    <Suspense fallback={<div className="aspect-square animate-pulse bg-stone-200" />}>
      <ProductDetail />
    </Suspense>
  );
}

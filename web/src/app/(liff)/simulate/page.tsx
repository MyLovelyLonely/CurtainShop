import { Suspense } from "react";
import SimulateStudio from "./SimulateStudio";

export default function Page() {
  return (
    <Suspense fallback={<div className="aspect-[4/3] animate-pulse bg-stone-200" />}>
      <SimulateStudio />
    </Suspense>
  );
}

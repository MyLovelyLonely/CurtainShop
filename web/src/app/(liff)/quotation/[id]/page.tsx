import { Suspense } from "react";

export default function Page({ params }: PageProps<"/quotation/[id]">) {
  return (
    <Suspense fallback={<div>กำลังโหลด...</div>}>
      <Quotation params={params} />
    </Suspense>
  );
}

async function Quotation({ params }: Pick<PageProps<"/quotation/[id]">, "params">) {
  const { id } = await params;
  return <div>ตรวจใบเสนอราคา {id}</div>;
}

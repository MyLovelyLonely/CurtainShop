// FlowAccount จำลอง ใช้ทดสอบตอนยังไม่มี API key (เปิดด้วย FLOWACCOUNT_MOCK=true)
// เก็บเอกสารไว้ในหน่วยความจำ รีสตาร์ทเซิร์ฟเวอร์แล้วข้อมูลหาย
import "server-only";

type Doc = Record<string, unknown> & { recordId: number; documentSerial: string; status: string };

// prefix เลขที่เอกสาร และเลขประเภทเอกสารตาม FlowAccount
const DOC_INFO: Record<string, { prefix: string; type: number }> = {
  quotations: { prefix: "QT", type: 3 },
  "billing-notes": { prefix: "BL", type: 5 },
  "tax-invoices": { prefix: "INV", type: 7 },
  receipts: { prefix: "RE", type: 9 },
};

// เก็บใน globalThis กันข้อมูลหายตอน hot reload ระหว่าง dev
const g = globalThis as unknown as { faMock?: { nextId: number; docs: Map<number, Doc & { docType: string }> } };
const store = (g.faMock ??= { nextId: 100001, docs: new Map() });

const ok = (data: unknown) => ({ status: 200, data: { status: true, message: "", code: 0, data } });
const fail = (status: number, message: string) => ({ status, data: { status: false, message, code: status, data: null } });

function create(docType: string, body: Record<string, unknown>, status = "awaiting") {
  const info = DOC_INFO[docType];
  const recordId = store.nextId++;
  const count = [...store.docs.values()].filter((d) => d.docType === docType).length + 1;
  const ym = new Date().toISOString().slice(0, 7).replace("-", "");

  const doc = {
    ...body,
    docType,
    recordId,
    documentId: recordId,
    documentSerial: `${info.prefix}${ym}${String(count).padStart(4, "0")}`,
    documentType: info.type,
    status,
    statusString: status,
    referencedByMe: (body.documentReference as unknown[]) ?? [],
  };
  store.docs.set(recordId, doc);
  return ok(doc);
}

export function mockFlowAccount(method: string, path: string, body?: unknown) {
  const [pathname, query = ""] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  const input = (body ?? {}) as Record<string, unknown>;

  // POST /upgrade/{docType} และ /upgrade/{docType}/with-payment
  if (parts[0] === "upgrade" && method === "POST") {
    const docType = parts[1];
    if (!DOC_INFO[docType]) return fail(404, "Not found");
    const refs = (input.documentReference as { recordId: number }[]) ?? [];
    if (!refs.length || !store.docs.has(Number(refs[0].recordId))) {
      return fail(400, "ไม่พบเอกสารต้นทางใน documentReference");
    }
    // ใบต้นทาง: ใบเสนอราคา/ใบแจ้งหนี้ → ดำเนินการแล้ว (approvedandprocessed)
    // ใบกำกับภาษีไม่มีสถานะ "เก็บเงินแล้ว" (มีแค่ awaiting / invoicedelivered / void) จึงคงสถานะเดิม
    // ใบใหม่: with-payment → เก็บเงินแล้ว (paid), ไม่รับเงิน → รอดำเนินการ (awaiting)
    const withPayment = parts[2] === "with-payment";
    const source = store.docs.get(Number(refs[0].recordId))!;
    if (source.docType !== "tax-invoices") source.status = source.statusString = "approvedandprocessed";
    return create(docType, input, withPayment ? "paid" : "awaiting");
  }

  const [docType, id, sub, statusId] = parts;
  if (!DOC_INFO[docType]) return fail(404, "Not found");

  // /{docType}
  if (!id) {
    if (method === "POST") return create(docType, input);
    if (method === "GET") {
      const params = new URLSearchParams(query);
      const page = Number(params.get("currentPage") ?? 1);
      const size = Number(params.get("pageSize") ?? 20);
      const all = [...store.docs.values()].filter((d) => d.docType === docType);
      return ok({ totalDocument: all.length, list: all.slice((page - 1) * size, page * size) });
    }
  }

  const doc = store.docs.get(Number(id));
  if (!doc || doc.docType !== docType) return fail(404, "ไม่พบเอกสาร");

  // /{docType}/{id}/status/{statusId}
  if (sub === "status" && method === "POST") {
    doc.status = doc.statusString = statusId;
    return ok(doc);
  }

  // /{docType}/{id}
  if (!sub) {
    if (method === "GET") return ok(doc);
    if (doc.status !== "awaiting") return fail(400, "แก้ไข/ลบได้เฉพาะเอกสารสถานะ awaiting");
    if (method === "PUT") {
      Object.assign(doc, input, { recordId: doc.recordId, documentSerial: doc.documentSerial });
      return ok(doc);
    }
    if (method === "DELETE") {
      store.docs.delete(doc.recordId);
      return ok({ deleteStatus: "success" });
    }
  }

  return fail(404, "Not found");
}

// POST /api/admin/quotations   สร้างใบเสนอราคา: บันทึกลงฐานข้อมูล + สร้างใน FlowAccount
// body: { estimate_id, admin_id, items?, project_name?, want_tax_invoice? }
//   items = [{ item_id, width, height, quantity }] ขนาดหน้างานจริงต่อรายการในใบประเมิน (Use Case 12)
//     แอดมินแก้ได้แค่ กว้าง / สูง / จำนวนหน้าต่างต่อห้อง ไม่ส่ง = ใช้ค่าจากใบประเมินราคา
//   สินค้า ราคาต่อหน่วย (base_price) จำนวนห้อง (room_count) และมัดจำ 50% ระบบกำหนดเอง แก้ไม่ได้
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount } from "@/lib/flowaccount";
import { billedQuantity, isAreaUnit, lineTotal, missingSize } from "@/lib/pricing";

const VAT_RATE = 0.07; // ร้านจดภาษีมูลค่าเพิ่ม ราคาสินค้ายังไม่รวม VAT
const DEFAULT_DEPOSIT_RATE = 0.5; // มัดจำ 50% ของยอดรวม ยังไม่รุ้เท่าไหร่

type ItemInput = { item_id: number; width?: number | null; height?: number | null; quantity?: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); // yyyy-MM-dd

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { estimate_id, admin_id } = body;
  if (!estimate_id || !admin_id) {
    return NextResponse.json({ error: "ต้องส่ง estimate_id และ admin_id" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // ลูกค้าและจำนวนห้องของใบประเมินราคา
    const customerRes = await client.query(
      `select c.*, e.room_count from price_estimate e join customer c using (customer_id) where e.estimate_id = $1`,
      [estimate_id],
    );
    const customer = customerRes.rows[0];
    if (!customer) return NextResponse.json({ error: "ไม่พบใบประเมินราคา" }, { status: 404 });
    const roomCount = Number(customer.room_count) || 1;

    // รายการสินค้าและราคาดึงจากใบประเมินราคา + สินค้า (ไม่รับจากฟอร์ม)
    const est = await client.query(
      `select i.item_id, i.product_id, i.width, i.height, i.quantity,
              p.name, p.base_price, p.price_unit, p.details as product_details
       from price_estimate_item i join product p using (product_id)
       where i.estimate_id = $1 order by i.item_id`,
      [estimate_id],
    );
    if (!est.rowCount) return NextResponse.json({ error: "ไม่มีรายการสินค้า" }, { status: 400 });

    // ขนาดหน้างานจริงที่แอดมินกรอก
    const edits = new Map<number, ItemInput>(((body.items ?? []) as ItemInput[]).map((i) => [Number(i.item_id), i]));

    const items = est.rows.map((row) => {
      const edit = edits.get(row.item_id);
      // อุปกรณ์ (หน่วยชุด/ชิ้น) ไม่ใช้กว้าง x สูง เก็บเป็นค่าว่าง
      const area = isAreaUnit(row.price_unit);
      const width = !area ? null : edit && edit.width !== undefined ? edit.width : row.width;
      const height = !area ? null : edit && edit.height !== undefined ? edit.height : row.height;
      const windows = Number(edit?.quantity ?? row.quantity); // จำนวนหน้าต่างต่อห้อง
      const line = { width, height, quantity: windows, unit_price: Number(row.base_price) };
      const roomTotal = lineTotal(line, row.price_unit); // ยอดต่อ 1 ห้อง
      return { ...line, windows, product_id: row.product_id, product: row, roomTotal, total: r2(roomTotal * roomCount) };
    });

    const badQty = items.filter((i) => !Number.isInteger(i.windows) || i.windows < 1);
    if (badQty.length) {
      return NextResponse.json(
        { error: `จำนวนหน้าต่างต้องเป็นจำนวนเต็มตั้งแต่ 1: ${badQty.map((i) => i.product.name).join(", ")}` },
        { status: 400 },
      );
    }
    const noSize = items.filter((i) => missingSize(i, i.product.price_unit));
    if (noSize.length) {
      return NextResponse.json(
        { error: `กรุณากรอกกว้างและสูงให้ครบ: ${noSize.map((i) => i.product.name).join(", ")}` },
        { status: 400 },
      );
    }

    // คำนวณยอด: ทุกห้องใช้รูปแบบเดียวกัน ยอดรวม = (รวมทุกสินค้าต่อห้อง) x จำนวนห้อง
    const roomSubTotal = r2(items.reduce((sum, i) => sum + i.roomTotal, 0));
    const subTotal = r2(roomSubTotal * roomCount);
    const vatAmount = r2(subTotal * VAT_RATE);
    const grandTotal = r2(subTotal + vatAmount);
    const depositAmount = r2(grandTotal * DEFAULT_DEPOSIT_RATE);

    // ชื่อบนเอกสารใช้ชื่อ-นามสกุลจริง (contactName เป็นฟิลด์บังคับของ FlowAccount)
    const contactName = customer.full_name;
    if (!contactName) return NextResponse.json({ error: "ลูกค้ายังไม่มีชื่อ-นามสกุล (full_name)" }, { status: 400 });
    const details = {
      project_name: body.project_name ?? null,
      room_count: roomCount, // quotation_item เก็บยอดต่อ 1 ห้อง ยอดรวม = รวมต่อห้อง x room_count
      want_tax_invoice: body.want_tax_invoice === true, // ลูกค้าขอใบกำกับภาษี (ส่งให้ลูกค้าเฉพาะคนที่ขอ)
      // สำเนาข้อมูลลูกค้า ณ วันออกเอกสาร
      customer: {
        name: contactName,
        phone: customer.phone,
        address: customer.address,
        ...customer.details,
      },
    };

    await client.query("begin");

    const q = await client.query(
      `insert into quotation (estimate_id, admin_id, total_amount, deposit_amount, details)
       values ($1, $2, $3, $4, $5) returning *`,
      [estimate_id, admin_id, grandTotal, depositAmount, details],
    );
    const quotation = q.rows[0];

    for (const i of items) {
      await client.query(
        `insert into quotation_item (quotation_id, product_id, width, height, quantity, unit_price)
         values ($1, $2, $3, $4, $5, $6)`,
        [quotation.quotation_id, i.product_id, i.width ?? null, i.height ?? null, i.quantity, i.unit_price],
      );
    }

    // สร้างใน FlowAccount (SimpleDocument)
    const fa = await flowAccount("POST", "/quotations", {
      recordId: 0,
      documentStructureType: "SimpleDocument",
      contactName, //required
      contactAddress: customer.address ?? "",
      contactNumber: customer.phone ?? "",
      contactEmail: customer.details?.email ?? "",
      contactZipCode: customer.details?.zip_code ?? "",
      contactTaxId: customer.details?.tax_id ?? "",
      contactBranch: customer.details?.branch ?? "",
      contactGroup: customer.details?.tax_id ? 3 : 1, // มีเลขผู้เสียภาษี = นิติบุคคล
      publishedOn: today(),
      projectName: body.project_name ?? "",
      reference: `Q${quotation.quotation_id}`,
      // FlowAccount ไม่มีบรรทัดคูณจำนวนห้อง รายการด้านบนจึงรวมทุกห้องแล้ว แจ้งยอดต่อห้องไว้ในหมายเหตุ
      remarks: roomCount > 1
        ? `ราคาต่อ 1 ห้อง ${roomSubTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท x ${roomCount} ห้อง = ${subTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท (ก่อน VAT)`
        : "",
      isVatInclusive: false, //required
      isVat: true, //required
      subTotal, //required
      discountAmount: 0,
      totalAfterDiscount: subTotal,
      vatAmount,
      grandTotal, //required
      items: items.map((i) => ({ //required
        type: i.product.product_details?.type ?? 3,
        name: i.product.name,
        // ผ้าม่าน: quantity ใน FlowAccount = ตร.ม. รวม ให้ quantity x pricePerUnit = total
        description: isAreaUnit(i.product.price_unit)
          ? `${i.width} x ${i.height} ม. x ${i.windows} หน้าต่าง` + (roomCount > 1 ? ` x ${roomCount} ห้อง` : "")
          : i.width && i.height ? `${i.width} x ${i.height} ม.` : "",
        // FlowAccount ไม่มีตัวคูณห้อง จึงรวมห้องเข้าไปในจำนวนของแต่ละรายการ
        quantity: r2(billedQuantity(i, i.product.price_unit) * roomCount),
        unitName: isAreaUnit(i.product.price_unit) ? i.product.price_unit : i.product.product_details?.unit_name ?? i.product.price_unit,
        pricePerUnit: i.unit_price,
        total: i.total,
      })),
    });

    const faDoc = fa.data?.data;
    if (fa.status !== 200 || !fa.data?.status || !faDoc?.recordId) {
      await client.query("rollback");
      return NextResponse.json({ error: "สร้างใน FlowAccount ไม่สำเร็จ", flowaccount: fa.data }, { status: 502 });
    }

    const updated = await client.query(
      `update quotation set flowaccount_record_id = $1, flowaccount_serial = $2
       where quotation_id = $3 returning *`,
      [faDoc.recordId, faDoc.documentSerial, quotation.quotation_id],
    );

    await client.query("commit");
    return NextResponse.json({ quotation: updated.rows[0] }, { status: 201 });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}

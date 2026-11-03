// ทดสอบดึงรูปจาก R2: npx tsx --env-file=.env.local scripts/r2-read-test.mts
//   1) list ไฟล์ใน bucket  2) ดึงผ่าน endpoint ส่วนตัว (ใช้ key)  3) ดึงผ่านลิงก์สาธารณะ (แบบที่ลูกค้าใน LIFF เปิด)
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFileSync } from "node:fs";
import { r2, publicUrl } from "../lib/r2";

const list = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET }));
const files = list.Contents ?? [];
console.log(`ไฟล์ใน bucket: ${files.length} ไฟล์`);
for (const f of files) console.log(` - ${f.Key}  ${f.Size} bytes  ${f.LastModified?.toISOString()}`);
if (!files.length) process.exit(0);

const key = files[files.length - 1].Key!;
const obj = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
const bytes = await obj.Body!.transformToByteArray();
console.log(`\nดึงผ่าน key: ${key}  ${obj.ContentType}  ${bytes.length} bytes`);

const res = await fetch(publicUrl(key));
const pub = new Uint8Array(await res.arrayBuffer());
console.log(`ดึงผ่านลิงก์สาธารณะ: ${res.status}  ${pub.length} bytes  ตรงกัน=${Buffer.compare(Buffer.from(bytes), Buffer.from(pub)) === 0}`);

const out = process.argv[2];
if (out) { writeFileSync(out, bytes); console.log(`บันทึกไว้ที่ ${out}`); }

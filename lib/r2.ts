// Cloudflare R2 (S3-compatible) เก็บไฟล์แคตตาล็อก / รูปสินค้า
//   อัปโหลดผ่าน endpoint ส่วนตัว (ใช้ key) แล้วเก็บลิงก์สาธารณะ R2_PUBLIC_URL/<key> ลงฐานข้อมูล
// test
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const globalForR2 = globalThis as unknown as { r2?: S3Client };

export const r2 = globalForR2.r2 ?? new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});
if (process.env.NODE_ENV !== "production") globalForR2.r2 = r2;

export const publicUrl = (key: string) => `${process.env.R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;

// อัปโหลดไฟล์ คืนลิงก์สาธารณะ
export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return publicUrl(key);
}

export async function deleteFile(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
}

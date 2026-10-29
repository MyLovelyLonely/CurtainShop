// อัปโหลดไฟล์ Supabase Storage (ต้องเป็น bucket สาธารณะ เพื่อให้หน้า LIFF แสดงรูปได้ตรง ๆ)

import { db } from "./db";

const BUCKET = process.env.SUPABASE_BUCKET ?? "catalogs";

const MAX_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {}

function extOf(file: File) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return m ? m[1].toLowerCase() : file.type.split("/")[1] ?? "bin";
}

/** อัปโหลดไฟล์ไปที่ `${folder}/<uuid>.<ext>` แล้วคืน public URL */
export async function uploadFile(folder: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new UploadError(`ไฟล์ ${file.name} ใหญ่เกิน 20MB`);
  const path = `${folder}/${crypto.randomUUID()}.${extOf(file)}`;
  const storage = db().storage;
  const { error } = await storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error && /bucket not found/i.test(error.message))
    throw new UploadError(`ไม่พบ bucket "${BUCKET}" ใน Supabase Storage (ตั้งชื่อได้ที่ SUPABASE_BUCKET)`);
  if (error) throw new UploadError(`อัปโหลด ${file.name} ไม่สำเร็จ: ${error.message}`);
  return storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** ลบไฟล์จาก public URL ที่ได้จาก uploadFile (ไม่ throw ถ้าลบไม่ได้) */
export async function removeFiles(urls: (string | null | undefined)[]) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const paths = urls
    .filter((u): u is string => !!u && u.includes(marker))
    .map((u) => decodeURIComponent(u.split(marker)[1]));
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
}

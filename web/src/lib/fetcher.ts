// fetch ฝั่ง client: คืน JSON หรือ throw ข้อความ error จาก API

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `เกิดข้อผิดพลาด (${res.status})`);
  return body as T;
}

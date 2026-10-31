// เปิดเว็บ (Next.js :3000) + ai-server (FastAPI :8000) พร้อมกันจาก terminal เดียว
// npm run dev       → ทั้งคู่
// npm run dev:web   → เฉพาะเว็บ
// npm run dev:ai    → เฉพาะ ai-server
// ตัวไหนเปิดอยู่แล้วจะข้าม, Ctrl+C ปิดทุกตัวที่สคริปต์นี้เปิด

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const only = process.argv[2];

const python = join(root, "ai-server", ".venv", win ? "Scripts/python.exe" : "bin/python");

const services = [
  {
    name: "web",
    color: 36,
    url: "http://localhost:3000",
    cwd: join(root, "web"),
    cmd: "npm",
    args: ["run", "dev"],
  },
  {
    name: "ai",
    color: 35,
    url: "http://localhost:8000/health",
    cwd: join(root, "ai-server"),
    cmd: python,
    args: ["-m", "uvicorn", "app.main:app", "--port", "8000"],
    env: { PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_PROGRESS_BARS: "1" },
    check: () => existsSync(python) || "ไม่พบ ai-server/.venv — ติดตั้งตาม ai-server/requirements.txt ก่อน",
  },
].filter((s) => !only || s.name === only);

const children = [];

async function running(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

function prefix(s, stream, out) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) out.write(`\x1b[${s.color}m[${s.name}]\x1b[0m ${line}\n`);
  });
}

for (const s of services) {
  const tag = `\x1b[${s.color}m[${s.name}]\x1b[0m`;
  if (await running(s.url)) {
    console.log(`${tag} เปิดอยู่แล้วที่ ${s.url.replace("/health", "")} — ข้าม`);
    continue;
  }
  const ok = s.check?.() ?? true;
  if (ok !== true) {
    console.log(`${tag} ${ok}`);
    continue;
  }
  const child = spawn(s.cmd, s.args, {
    cwd: s.cwd,
    env: { ...process.env, ...s.env },
    shell: win && s.cmd === "npm", // npm บน Windows เป็น .cmd ต้องผ่าน shell
  });
  prefix(s, child.stdout, process.stdout);
  prefix(s, child.stderr, process.stderr);
  child.on("exit", (code) => console.log(`${tag} หยุดทำงาน (exit ${code})`));
  children.push(child);
}

if (!children.length) process.exit(0);

// ปิดลูกทั้งต้นไม้ (บน Windows kill() ปิดแค่ตัว shell ตัวลูกจะค้าง)
function stop() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (win) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGINT");
  }
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

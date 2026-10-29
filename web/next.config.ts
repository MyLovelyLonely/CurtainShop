import type { NextConfig } from "next";

// รูปจำลองผ้าม่านเก็บใน Cloudflare R2 (R2_PUBLIC_URL เช่น https://pub-xxx.r2.dev)
const r2Host = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : "*.r2.dev";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // รูปสินค้าจาก Supabase Storage (bucket สาธารณะ) + รูปจำลองใน R2
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: r2Host },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

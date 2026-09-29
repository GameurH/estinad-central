import type { NextConfig } from "next";

/**
 * Product photos are served straight from Supabase Storage public URLs, so the
 * optimizer needs that host allow-listed. The project host comes from the
 * environment; the wildcard fallback keeps a build without `.env` (or a swapped
 * project) working instead of crashing on the first remote image.
 */
const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost ?? "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;

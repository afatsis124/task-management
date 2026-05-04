import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/house-lift.html" },
      ],
    };
  },
};

export default nextConfig;

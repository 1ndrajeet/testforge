// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',  // REQUIRED for Docker
  
  typescript: {
    ignoreBuildErrors: false,
  },
  
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  
};

export default nextConfig;
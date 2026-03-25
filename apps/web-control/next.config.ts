import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@zerobot/shared"],
}

export default nextConfig 

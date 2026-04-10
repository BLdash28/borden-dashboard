/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig

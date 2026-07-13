/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion', 'date-fns'],
    // pdfkit necesita sus archivos AFM/data en runtime. Vercel serverless no los
    // incluye por defecto → falla con "Internal server error" al generar PDF.
    outputFileTracingIncludes: {
      'app/api/comercial/ejecucion/co/exito/resumen-pdf/route': [
        './node_modules/pdfkit/js/data/**/*',
        './public/borden-logo.png',
      ],
    },
  },
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig

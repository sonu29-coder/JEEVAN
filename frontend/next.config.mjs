/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const backendOrigin = process.env.JEEVAN_API_INTERNAL_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${backendOrigin}/auth/:path*`,
      },
      {
        source: '/health',
        destination: `${backendOrigin}/health`,
      },
      {
        source: '/docs',
        destination: `${backendOrigin}/docs`,
      },
      {
        source: '/openapi.json',
        destination: `${backendOrigin}/openapi.json`,
      },
    ]
  },
}

export default nextConfig

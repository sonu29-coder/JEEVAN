/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    let rawBackend = (
      process.env.JEEVAN_API_INTERNAL_URL ||
      process.env.BACKEND_URL ||
      ''
    ).trim()

    // Use NEXT_PUBLIC_API_URL only if it is an absolute HTTP(S) URL, avoiding loop with relative '/api'
    if (!rawBackend && process.env.NEXT_PUBLIC_API_URL && /^https?:\/\//i.test(process.env.NEXT_PUBLIC_API_URL.trim())) {
      rawBackend = process.env.NEXT_PUBLIC_API_URL.trim()
    }

    if (!rawBackend) {
      rawBackend = 'http://localhost:8000'
    }

    let backendOrigin = rawBackend.replace(/\/+$/, '')
    if (backendOrigin && !/^https?:\/\//i.test(backendOrigin)) {
      backendOrigin = backendOrigin.includes('localhost') || backendOrigin.includes('127.0.0.1')
        ? `http://${backendOrigin}`
        : `https://${backendOrigin}`
    }
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

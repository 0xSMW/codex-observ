import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/activity', destination: '/', permanent: true }]
  },
}

export default nextConfig

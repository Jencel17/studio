import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  devIndicators: {
    buildActivity: false,
    allowedDevOrigins: ['*'],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    turbopack: {
      externals: ['@tensorflow/tfjs-core/dist/ops/ops_for_converter'],
    },
  },
};

export default nextConfig;

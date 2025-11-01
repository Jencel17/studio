
import type {NextConfig} from 'next';
import withPWA from 'next-pwa';

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude the 'encoding' module from the client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        encoding: false,
      };
    }
    return config;
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
        protocol: 'https' as const,
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  devIndicators: {
    allowedDevOrigins: ['*'],
  },
};

export default pwaConfig(nextConfig);

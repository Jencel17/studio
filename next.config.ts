
import type {NextConfig} from 'next';
import withPWA from 'next-pwa';

const pwaConfig = {
  dest: 'public',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
  },
  // Point to our custom service worker
  sw: 'sw.js',
  // Disable the PWA in development
  disable: process.env.NODE_ENV === 'development',
};

const nextConfig: NextConfig = {
  webpack: (config, { isServer, dev, buildId, config: { distDir } }) => {
    // Exclude the 'encoding' module from the client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        encoding: false,
      };
    }
    
    if (!isServer && !dev) {
        const {InjectManifest} = require('workbox-webpack-plugin');
        config.plugins.push(
            new InjectManifest({
                swSrc: './public/sw.js',
                swDest: 'sw.js',
                // This is needed to prevent an error about "precache manifest" not being defined
                injectionPoint: 'self.__WB_MANIFEST',
            })
        );
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
};

export default withPWA(pwaConfig)(nextConfig);

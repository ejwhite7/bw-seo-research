import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Move serverComponentsExternalPackages to top level as serverExternalPackages
  serverExternalPackages: ['@anthropic-ai/sdk'],

  // Disable ESLint during build for deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Headers for security and monitoring
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Service-Name',
            value: 'keyword-engine'
          },
          {
            key: 'X-Service-Version',
            value: process.env.npm_package_version || '1.0.0'
          }
        ]
      }
    ];
  },
  
  // Webpack configuration for better builds
  webpack: (config, { isServer }) => {
    // Optimize bundle size
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    };
    
    return config;
  },
  
  // Environment variables to expose to the client
  env: {
    NEXT_PUBLIC_APP_NAME: 'Dream 100 Keyword Engine',
    NEXT_PUBLIC_VERSION: process.env.npm_package_version || '1.0.0'
  }
};

// Sentry configuration
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  
  // Suppresses source map uploading logs during build
  silent: true,
  
  // Upload source maps in production only
  dryRun: process.env.NODE_ENV !== 'production',
  
  // Disable webpack plugin in development
  disableServerWebpackPlugin: process.env.NODE_ENV !== 'production',
  disableClientWebpackPlugin: process.env.NODE_ENV !== 'production',
  
  // Additional config options for the Sentry Webpack plugin
  widenClientFileUpload: true,
  hideSourceMaps: true,
  
  // Tree-shaking configuration
  tunnelRoute: '/monitoring'
};

// Export configuration with Sentry
export default process.env.SENTRY_DSN ? 
  withSentryConfig(nextConfig, sentryWebpackPluginOptions) : 
  nextConfig;

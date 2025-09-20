import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output configuration for Vercel
  output: 'standalone',
  
  // Compression and optimization
  compress: true,
  poweredByHeader: false,
  
  // Experimental features for performance
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', 'ioredis', 'bullmq'],
    optimizePackageImports: ['lucide-react', '@heroicons/react'],
    serverMinification: true,
    optimizeCss: true,
    gzipSize: true,
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js'
        }
      }
    }
  },
  
  // API route configuration
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: false,
    externalResolver: true
  },
  
  // Image optimization for Vercel
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**'
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      },
      {
        protocol: 'https',
        hostname: 'cdn.vercel.com'
      }
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 31536000, // 1 year
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384]
  },
  
  // Headers for security, performance and monitoring
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.vercel-insights.com https://vitals.vercel-insights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://api.anthropic.com https://apiv2.ahrefs.com wss://realtime.supabase.co https://*.supabase.co https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ];
    
    // Add localhost for development
    if (isDevelopment) {
      cspDirectives[1] += " http://localhost:* ws://localhost:*";
      cspDirectives[4] += " http://localhost:*";
    }
    
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Service-Name',
            value: 'dream100-keyword-engine'
          },
          {
            key: 'X-Service-Version',
            value: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
          },
          {
            key: 'X-Environment',
            value: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development'
          },
          {
            key: 'X-Deployment-Id',
            value: process.env.VERCEL_DEPLOYMENT_ID || 'local'
          },
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=0, stale-while-revalidate=60'
          },
          {
            key: 'X-RateLimit-Limit',
            value: '100'
          },
          {
            key: 'X-RateLimit-Remaining',
            value: '99'
          }
        ]
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; ')
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: isProduction ? 'max-age=63072000; includeSubDomains; preload' : 'max-age=0'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp'
          }
        ]
      },
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  },
  
  // Redirects for common routes and SEO
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true
      },
      {
        source: '/dashboard',
        destination: '/app',
        permanent: false
      },
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true
      },
      {
        source: '/signup',
        destination: '/auth/register',
        permanent: true
      }
    ];
  },
  
  // Rewrites for API proxying and monitoring
  async rewrites() {
    return [
      {
        source: '/monitoring/:path*',
        destination: 'https://ingest.sentry.io/:path*'
      },
      {
        source: '/health',
        destination: '/api/health'
      },
      {
        source: '/status',
        destination: '/api/health'
      }
    ];
  },
  
  // Webpack configuration for optimal Vercel builds
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Production optimizations
    if (!dev && !isServer) {
      // Enable tree shaking
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      
      // Advanced chunk splitting for better caching
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        automaticNameDelimiter: '~',
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: -10,
            chunks: 'all'
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            priority: 10,
            chunks: 'all'
          },
          ui: {
            test: /[\\/]node_modules[\\/](@headlessui|@heroicons|lucide-react)[\\/]/,
            name: 'ui',
            priority: 5,
            chunks: 'all'
          },
          charts: {
            test: /[\\/]node_modules[\\/](recharts)[\\/]/,
            name: 'charts',
            priority: 5,
            chunks: 'all'
          },
          supabase: {
            test: /[\\/]node_modules[\\/](@supabase)[\\/]/,
            name: 'supabase',
            priority: 5,
            chunks: 'all'
          }
        }
      };
      
      // Minimize bundle size
      config.optimization.minimize = true;
    }
    
    // Resolve fallbacks for Node.js modules in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
      child_process: false
    };
    
    // Add build info to runtime
    config.plugins.push(
      new webpack.DefinePlugin({
        '__BUILD_ID__': JSON.stringify(buildId),
        '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
        '__VERCEL_ENV__': JSON.stringify(process.env.VERCEL_ENV || 'development')
      })
    );
    
    // Bundle analyzer for development
    if (dev && process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'server',
          analyzerPort: isServer ? 8888 : 8889,
          openAnalyzer: true
        })
      );
    }
    
    return config;
  },
  
  // Environment variables to expose to the client
  env: {
    NEXT_PUBLIC_APP_NAME: 'Dream 100 Keyword Engine',
    NEXT_PUBLIC_VERSION: process.env.npm_package_version || '1.0.0',
    BUILDTIME: new Date().toISOString(),
    VERCEL_ENV: process.env.VERCEL_ENV || 'development'
  },
  
  // Logging configuration
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development'
    }
  },
  
  // TypeScript configuration
  typescript: {
    // Fail build on type errors
    ignoreBuildErrors: false
  },
  
  // ESLint configuration
  eslint: {
    // Fail build on lint errors
    ignoreDuringBuilds: false
  },
  
  // Compiler configuration
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false
  }
};

// Sentry configuration for production error tracking
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
  tunnelRoute: '/monitoring',
  
  // Release configuration
  release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
};

// Export configuration with conditional Sentry integration
export default process.env.SENTRY_DSN && process.env.NODE_ENV === 'production' ? 
  withSentryConfig(nextConfig, sentryWebpackPluginOptions) : 
  nextConfig;

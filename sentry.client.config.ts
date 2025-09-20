import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session replay for debugging
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Enhanced error context
  beforeSend(event, hint) {
    // Filter out noisy errors
    if (event.exception) {
      const error = event.exception.values?.[0];
      if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
        return null;
      }
      if (error?.value?.includes('Non-Error promise rejection captured')) {
        return null;
      }
    }
    return event;
  },
  
  // Custom tags for filtering
  initialScope: {
    tags: {
      component: 'client',
      feature: 'keyword-engine',
    },
  },
  
  integrations: [
    Sentry.replayIntegration({
      maskAllInputs: true,
      maskAllText: false,
      blockAllMedia: true,
    }),
  ],
});
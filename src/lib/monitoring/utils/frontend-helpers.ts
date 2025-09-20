import { trackUserActivity, trackError, trackPerformance, getSystemHealth } from '../init';

// Web Vitals tracking
export function trackWebVitals() {
  if (typeof window === 'undefined') return;

  // Use the web-vitals library if available
  if ('PerformanceObserver' in window) {
    // Track Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      
      fetch('/api/monitoring/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'web-vitals',
          data: {
            lcp: lastEntry.startTime,
            path: window.location.pathname,
            element: lastEntry.element?.tagName
          }
        })
      }).catch(console.error);
    });
    
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // Track First Input Delay (FID)
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        const fid = entry.processingStart - entry.startTime;
        
        fetch('/api/monitoring/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'web-vitals',
            data: {
              fid,
              path: window.location.pathname,
              eventType: entry.name
            }
          })
        }).catch(console.error);
      });
    });
    
    fidObserver.observe({ type: 'first-input', buffered: true });

    // Track Cumulative Layout Shift (CLS)
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      });
      
      fetch('/api/monitoring/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'web-vitals',
          data: {
            cls: clsValue,
            path: window.location.pathname
          }
        })
      }).catch(console.error);
    });
    
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  }
}

// API call tracking
export function trackAPICall(
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
  cached: boolean = false,
  userId?: string
) {
  fetch('/api/monitoring/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'api-performance',
      data: {
        endpoint,
        method,
        statusCode,
        responseTime,
        cached
      },
      userId
    })
  }).catch(console.error);
}

// User interaction tracking
export function trackUserInteraction(
  userId: string,
  sessionId: string,
  action: string,
  feature: string,
  metadata?: Record<string, any>,
  duration?: number
) {
  fetch('/api/monitoring/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'user-activity',
      data: {
        action,
        feature,
        metadata,
        duration
      },
      userId,
      sessionId
    })
  }).catch(console.error);
}

// Error tracking
export function trackClientError(
  error: Error | string,
  context?: Record<string, any>,
  userId?: string
) {
  const errorData = {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error,
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  fetch('/api/monitoring/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'error',
      data: errorData,
      userId
    })
  }).catch(console.error);
}

// Performance timing tracking
export function trackPageLoad() {
  if (typeof window === 'undefined') return;

  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = performance.timing;
      const navigation = performance.navigation;
      
      const metrics = {
        dnsLookupTime: timing.domainLookupEnd - timing.domainLookupStart,
        tcpConnectionTime: timing.connectEnd - timing.connectStart,
        serverResponseTime: timing.responseEnd - timing.requestStart,
        domProcessingTime: timing.domComplete - timing.domLoading,
        totalLoadTime: timing.loadEventEnd - timing.navigationStart,
        navigationType: navigation.type
      };

      trackPerformance('page_load', metrics.totalLoadTime, {
        ...metrics,
        path: window.location.pathname
      });
    }, 0);
  });
}

// Feature usage tracking
export function trackFeatureUsage(
  userId: string,
  sessionId: string,
  feature: string,
  action: string = 'used',
  metadata?: Record<string, any>
) {
  trackUserInteraction(userId, sessionId, action, feature, metadata);
}

// Conversion tracking
export function trackConversion(
  userId: string,
  sessionId: string,
  conversionType: string,
  value?: number,
  metadata?: Record<string, any>
) {
  trackUserInteraction(userId, sessionId, 'conversion', 'conversion', {
    conversionType,
    value,
    ...metadata
  });
}

// Session management
let currentSessionId: string | null = null;

export function startUserSession(userId: string, metadata?: Record<string, any>): string {
  currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  trackUserInteraction(userId, currentSessionId, 'session_start', 'core', {
    ...metadata,
    startTime: Date.now()
  });
  
  return currentSessionId;
}

export function endUserSession(userId: string) {
  if (currentSessionId) {
    trackUserInteraction(userId, currentSessionId, 'session_end', 'core', {
      endTime: Date.now()
    });
    currentSessionId = null;
  }
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

// User activity tracking functions
export function createUserActivityTracker(userId?: string) {
  const sessionId = getCurrentSessionId();

  const trackClick = (element: string, context?: Record<string, any>) => {
    if (userId && sessionId) {
      trackUserInteraction(userId, sessionId, 'click', 'ui', {
        element,
        ...context
      });
    }
  };

  const trackFormSubmit = (formType: string, success: boolean, metadata?: Record<string, any>) => {
    if (userId && sessionId) {
      trackUserInteraction(userId, sessionId, 'form_submit', 'forms', {
        formType,
        success,
        ...metadata
      });
    }
  };

  const trackPageView = (page: string, metadata?: Record<string, any>) => {
    if (userId && sessionId) {
      trackUserInteraction(userId, sessionId, 'page_view', 'navigation', {
        page,
        ...metadata
      });
    }
  };

  const trackSearch = (query: string, resultsCount: number, metadata?: Record<string, any>) => {
    if (userId && sessionId) {
      trackUserInteraction(userId, sessionId, 'search', 'search', {
        queryLength: query.length,
        resultsCount,
        hasResults: resultsCount > 0,
        ...metadata
      });
    }
  };

  return {
    trackClick,
    trackFormSubmit,
    trackPageView,
    trackSearch,
    trackFeatureUsage: (feature: string, metadata?: Record<string, any>) => {
      if (userId && sessionId) {
        trackFeatureUsage(userId, sessionId, feature, 'used', metadata);
      }
    },
    trackConversion: (conversionType: string, value?: number, metadata?: Record<string, any>) => {
      if (userId && sessionId) {
        trackConversion(userId, sessionId, conversionType, value, metadata);
      }
    }
  };
}

// Error boundary helper
export function createErrorBoundary() {
  return {
    onError: (error: Error, errorInfo: any) => {
      trackClientError(error, {
        errorInfo,
        boundary: 'react-error-boundary'
      });
    }
  };
}

// System health check
export async function checkSystemHealth(): Promise<{
  healthy: boolean;
  services: Record<string, any>;
  alerts: any[];
  uptime: number;
}> {
  try {
    const response = await fetch('/api/health?detailed=true');
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const healthData = await response.json();
    return {
      healthy: healthData.status === 'healthy',
      services: healthData.health?.services || {},
      alerts: [],
      uptime: 100 // Would be calculated from actual uptime
    };
  } catch (error) {
    trackClientError(error as Error, { context: 'health_check' });
    return {
      healthy: false,
      services: {},
      alerts: [],
      uptime: 0
    };
  }
}

// Monitoring dashboard data fetcher
export async function fetchMonitoringData(type: string, timeRange?: number) {
  try {
    const params = new URLSearchParams();
    if (timeRange) params.append('timeRange', timeRange.toString());
    if (type) params.append('type', type);
    
    const response = await fetch(`/api/monitoring/metrics?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch monitoring data: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    trackClientError(error as Error, { context: 'monitoring_data_fetch', type, timeRange });
    throw error;
  }
}

// Initialize monitoring on page load
export function initializeFrontendMonitoring(userId?: string) {
  if (typeof window === 'undefined') return;

  // Track web vitals
  trackWebVitals();
  
  // Track page load performance
  trackPageLoad();
  
  // Start user session if userId provided
  if (userId) {
    startUserSession(userId, {
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      language: navigator.language
    });
    
    // End session on page unload
    window.addEventListener('beforeunload', () => {
      endUserSession(userId);
    });
  }
  
  // Set up global error handler
  window.addEventListener('error', (event) => {
    trackClientError(event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      type: 'window_error'
    }, userId);
  });
  
  // Set up unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    trackClientError(event.reason, {
      type: 'unhandled_promise_rejection'
    }, userId);
  });
}

// Component monitoring helper
export function createComponentMonitor(componentName: string) {
  return {
    startTime: performance.now(),
    measureRenderTime: () => {
      const endTime = performance.now();
      const renderTime = endTime - performance.now();
      trackPerformance(`component_render_${componentName}`, renderTime, {
        componentName
      });
    }
  };
}
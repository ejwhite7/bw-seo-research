import { PerformanceMetric, APIMetric, ResourceMetric } from './types';
import { MonitoringConfig } from './config';
import { AlertManager } from './alert-manager';
import * as Sentry from '@sentry/nextjs';

export class PerformanceMonitor {
  private config: MonitoringConfig;
  private alertManager: AlertManager;
  private metrics: PerformanceMetric[] = [];
  private apiMetrics: APIMetric[] = [];
  private resourceMetrics: ResourceMetric[] = [];
  private observer?: PerformanceObserver;
  private navigationObserver?: PerformanceObserver;
  private resourceObserver?: PerformanceObserver;

  constructor(config: MonitoringConfig, alertManager: AlertManager) {
    this.config = config;
    this.alertManager = alertManager;
    
    if (typeof window !== 'undefined') {
      this.initializeBrowserMonitoring();
    }
    
    // Start periodic cleanup
    setInterval(() => this.cleanup(), 300000); // Every 5 minutes
  }

  private initializeBrowserMonitoring(): void {
    // Web Vitals monitoring
    if (this.config.performance.enableWebVitals) {
      this.initializeWebVitals();
    }

    // Navigation timing
    if (this.config.performance.enableNavigationTiming) {
      this.initializeNavigationTiming();
    }

    // Resource timing
    if (this.config.performance.enableResourceTiming) {
      this.initializeResourceTiming();
    }

    // User interaction tracking
    if (this.config.performance.enableUserInteraction) {
      this.initializeUserInteractionTracking();
    }
  }

  private initializeWebVitals(): void {
    // Use web-vitals library if available, otherwise implement basic tracking
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          
          this.recordMetric({
            operation: 'web_vitals_lcp',
            duration: lastEntry.startTime,
            timestamp: new Date(),
            success: true,
            metadata: {
              element: lastEntry.element?.tagName,
              url: lastEntry.url,
              size: lastEntry.size
            }
          });
          
          // Alert if LCP is poor (> 2.5s)
          if (lastEntry.startTime > 2500) {
            this.alertManager.triggerAlert({
              type: 'performance',
              severity: 'warning',
              message: `Poor LCP detected: ${(lastEntry.startTime / 1000).toFixed(2)}s`,
              metadata: { lcp: lastEntry.startTime }
            });
          }
        });
        
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (error) {
        console.warn('LCP observer failed:', error);
      }

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.recordMetric({
              operation: 'web_vitals_fid',
              duration: entry.processingStart - entry.startTime,
              timestamp: new Date(),
              success: true,
              metadata: {
                inputDelay: entry.processingStart - entry.startTime,
                eventType: entry.name
              }
            });
            
            // Alert if FID is poor (> 100ms)
            const fid = entry.processingStart - entry.startTime;
            if (fid > 100) {
              this.alertManager.triggerAlert({
                type: 'performance',
                severity: 'warning',
                message: `Poor FID detected: ${fid.toFixed(2)}ms`,
                metadata: { fid }
              });
            }
          });
        });
        
        fidObserver.observe({ type: 'first-input', buffered: true });
      } catch (error) {
        console.warn('FID observer failed:', error);
      }

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          
          this.recordMetric({
            operation: 'web_vitals_cls',
            duration: clsValue,
            timestamp: new Date(),
            success: true,
            metadata: {
              cumulativeScore: clsValue
            }
          });
          
          // Alert if CLS is poor (> 0.1)
          if (clsValue > 0.1) {
            this.alertManager.triggerAlert({
              type: 'performance',
              severity: 'warning',
              message: `Poor CLS detected: ${clsValue.toFixed(3)}`,
              metadata: { cls: clsValue }
            });
          }
        });
        
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (error) {
        console.warn('CLS observer failed:', error);
      }
    }
  }

  private initializeNavigationTiming(): void {
    if (typeof window !== 'undefined' && window.performance && window.performance.navigation) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const timing = performance.timing;
          const navigation = performance.navigation;
          
          // DNS lookup time
          this.recordMetric({
            operation: 'navigation_dns_lookup',
            duration: timing.domainLookupEnd - timing.domainLookupStart,
            timestamp: new Date(),
            success: true,
            metadata: { type: navigation.type }
          });
          
          // TCP connection time
          this.recordMetric({
            operation: 'navigation_tcp_connection',
            duration: timing.connectEnd - timing.connectStart,
            timestamp: new Date(),
            success: true,
            metadata: { type: navigation.type }
          });
          
          // Server response time
          this.recordMetric({
            operation: 'navigation_server_response',
            duration: timing.responseEnd - timing.requestStart,
            timestamp: new Date(),
            success: true,
            metadata: { type: navigation.type }
          });
          
          // DOM processing time
          this.recordMetric({
            operation: 'navigation_dom_processing',
            duration: timing.domComplete - timing.domLoading,
            timestamp: new Date(),
            success: true,
            metadata: { type: navigation.type }
          });
          
          // Total page load time
          const totalLoadTime = timing.loadEventEnd - timing.navigationStart;
          this.recordMetric({
            operation: 'navigation_total_load',
            duration: totalLoadTime,
            timestamp: new Date(),
            success: true,
            metadata: { type: navigation.type }
          });
          
          // Alert on slow page loads
          if (totalLoadTime > this.config.performance.verySlowThreshold) {
            this.alertManager.triggerAlert({
              type: 'performance',
              severity: 'warning',
              message: `Slow page load detected: ${(totalLoadTime / 1000).toFixed(2)}s`,
              metadata: { loadTime: totalLoadTime }
            });
          }
        }, 0);
      });
    }
  }

  private initializeResourceTiming(): void {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        this.resourceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            // Skip navigation entries
            if (entry.entryType === 'navigation') return;
            
            const duration = entry.responseEnd - entry.startTime;
            const resourceType = this.getResourceType(entry.name);
            
            this.recordResourceMetric({
              type: 'network',
              name: resourceType,
              value: duration,
              unit: 'ms',
              timestamp: new Date(),
              service: 'frontend',
              instance: entry.name
            });
            
            // Alert on slow resources
            if (duration > 5000) { // 5 seconds
              this.alertManager.triggerAlert({
                type: 'performance',
                severity: 'info',
                message: `Slow resource load: ${entry.name} took ${(duration / 1000).toFixed(2)}s`,
                metadata: {
                  resource: entry.name,
                  duration,
                  type: resourceType
                }
              });
            }
          });
        });
        
        this.resourceObserver.observe({ entryTypes: ['resource'] });
      } catch (error) {
        console.warn('Resource observer failed:', error);
      }
    }
  }

  private initializeUserInteractionTracking(): void {
    if (typeof window !== 'undefined') {
      const startTime = performance.now();
      
      // Track click events
      document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const elementInfo = this.getElementInfo(target);
        
        this.recordMetric({
          operation: 'user_interaction_click',
          duration: performance.now() - startTime,
          timestamp: new Date(),
          success: true,
          metadata: {
            element: elementInfo,
            x: event.clientX,
            y: event.clientY
          }
        });
      });
      
      // Track input events
      document.addEventListener('input', (event) => {
        const target = event.target as HTMLElement;
        const elementInfo = this.getElementInfo(target);
        
        this.recordMetric({
          operation: 'user_interaction_input',
          duration: performance.now() - startTime,
          timestamp: new Date(),
          success: true,
          metadata: {
            element: elementInfo,
            inputType: target.tagName.toLowerCase()
          }
        });
      });
    }
  }

  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `Performance: ${metric.operation}`,
      level: 'info',
      category: 'performance',
      data: {
        duration: metric.duration,
        success: metric.success,
        ...metric.metadata
      }
    });
    
    Sentry.setMeasurement(metric.operation, metric.duration, 'millisecond');
    
    // Check thresholds
    this.checkPerformanceThresholds(metric);
  }

  recordAPIMetric(metric: APIMetric): void {
    this.apiMetrics.push(metric);
    
    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `API: ${metric.method} ${metric.endpoint}`,
      level: metric.statusCode >= 400 ? 'warning' : 'info',
      category: 'api',
      data: {
        endpoint: metric.endpoint,
        method: metric.method,
        statusCode: metric.statusCode,
        responseTime: metric.responseTime,
        cached: metric.cached
      }
    });
    
    Sentry.setMeasurement(`api_${metric.endpoint.replace(/[^a-zA-Z0-9]/g, '_')}_response_time`, metric.responseTime, 'millisecond');
    
    // Alert on slow API calls
    if (metric.responseTime > this.config.performance.verySlowThreshold) {
      this.alertManager.triggerAlert({
        type: 'performance',
        severity: 'warning',
        message: `Slow API call: ${metric.endpoint} took ${metric.responseTime}ms`,
        metadata: {
          endpoint: metric.endpoint,
          method: metric.method,
          responseTime: metric.responseTime,
          statusCode: metric.statusCode
        }
      });
    }
  }

  recordResourceMetric(metric: ResourceMetric): void {
    this.resourceMetrics.push(metric);
    
    // Send to Sentry
    Sentry.setMeasurement(`resource_${metric.type}_${metric.name}`, metric.value, metric.unit);
  }

  getPerformanceStats(timeWindow: number = 3600000): {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    slowRequests: number;
    totalRequests: number;
    errorRate: number;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    if (recentMetrics.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        slowRequests: 0,
        totalRequests: 0,
        errorRate: 0
      };
    }
    
    const durations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const totalRequests = recentMetrics.length;
    const failedRequests = recentMetrics.filter(m => !m.success).length;
    const slowRequests = recentMetrics.filter(m => m.duration > this.config.performance.slowThreshold).length;
    
    return {
      avgResponseTime: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p95ResponseTime: durations[Math.floor(durations.length * 0.95)] || 0,
      p99ResponseTime: durations[Math.floor(durations.length * 0.99)] || 0,
      slowRequests,
      totalRequests,
      errorRate: failedRequests / totalRequests
    };
  }

  getAPIStats(timeWindow: number = 3600000): Record<string, {
    avgResponseTime: number;
    requestCount: number;
    errorRate: number;
    slowRequestRate: number;
  }> {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentAPIMetrics = this.apiMetrics.filter(m => m.timestamp > cutoff);
    
    const statsByEndpoint: Record<string, {
      avgResponseTime: number;
      requestCount: number;
      errorRate: number;
      slowRequestRate: number;
    }> = {};
    
    recentAPIMetrics.forEach(metric => {
      const key = `${metric.method} ${metric.endpoint}`;
      if (!statsByEndpoint[key]) {
        statsByEndpoint[key] = {
          avgResponseTime: 0,
          requestCount: 0,
          errorRate: 0,
          slowRequestRate: 0
        };
      }
      
      const stats = statsByEndpoint[key];
      stats.requestCount++;
      stats.avgResponseTime = ((stats.avgResponseTime * (stats.requestCount - 1)) + metric.responseTime) / stats.requestCount;
      
      if (metric.statusCode >= 400) {
        stats.errorRate = (stats.errorRate * (stats.requestCount - 1) + 1) / stats.requestCount;
      }
      
      if (metric.responseTime > this.config.performance.slowThreshold) {
        stats.slowRequestRate = (stats.slowRequestRate * (stats.requestCount - 1) + 1) / stats.requestCount;
      }
    });
    
    return statsByEndpoint;
  }

  private checkPerformanceThresholds(metric: PerformanceMetric): void {
    if (metric.duration > this.config.performance.verySlowThreshold) {
      this.alertManager.triggerAlert({
        type: 'performance',
        severity: 'warning',
        message: `Very slow operation: ${metric.operation} took ${metric.duration}ms`,
        metadata: {
          operation: metric.operation,
          duration: metric.duration,
          threshold: this.config.performance.verySlowThreshold
        }
      });
    }
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'javascript';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.includes('api/')) return 'api';
    return 'other';
  }

  private getElementInfo(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const className = element.className ? `.${element.className.split(' ').join('.')}` : '';
    return `${tag}${id}${className}`.slice(0, 100);
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - 86400000); // 24 hours
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    this.apiMetrics = this.apiMetrics.filter(m => m.timestamp > cutoff);
    this.resourceMetrics = this.resourceMetrics.filter(m => m.timestamp > cutoff);
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.navigationObserver) {
      this.navigationObserver.disconnect();
    }
    if (this.resourceObserver) {
      this.resourceObserver.disconnect();
    }
  }
}
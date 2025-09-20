import * as Sentry from '@sentry/nextjs';
import { ComponentType, ErrorInfo } from 'react';
// import type { ApiUsageEvent } from '@/types/api'; // TODO: Fix when types/api is available

// Enhanced type definitions for better type safety
type SentryBreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
type SentryErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

interface SentryBreadcrumbData {
  [key: string]: any;
}

interface SentryContext {
  [key: string]: any;
}

export class SentryReporter {
  static captureApiUsage(event: any): void { // TODO: Use proper ApiUsageEvent type
    Sentry.addBreadcrumb({
      message: `API call to ${event.provider}`,
      level: event.status >= 400 ? 'warning' : 'info',
      category: 'api-usage',
      data: {
        provider: event.provider,
        endpoint: event.endpoint,
        method: event.method,
        status: event.status,
        responseTime: event.responseTime,
        cost: event.cost,
        cached: event.cached,
        userId: event.userId,
        runId: event.runId
      }
    });

    if (event.status >= 400) {
      Sentry.captureMessage(`API Error: ${event.provider} ${event.endpoint}`, 'warning');
    }
  }

  static captureApiMetrics(serviceName: string, metrics: Record<string, any>): void {
    Sentry.addBreadcrumb({
      message: `API metrics for ${serviceName}`,
      level: 'info',
      category: 'api-metrics',
      data: {
        serviceName,
        ...metrics
      }
    });
  }

  static captureBusinessMetrics(metrics: Record<string, any>): void {
    Sentry.addBreadcrumb({
      message: 'Business metrics update',
      level: 'info',
      category: 'business-metrics',
      data: metrics
    });
  }

  static captureKeywordProcessing(data: {
    stage: string;
    keywordCount: number;
    processingTime: number;
    success: boolean;
    runId?: string;
    userId?: string;
  }): void {
    Sentry.addBreadcrumb({
      message: 'Keyword processing event',
      level: 'info',
      category: 'keyword-processing',
      data: {
        stage: data.stage,
        keywordCount: data.keywordCount,
        processingTime: data.processingTime,
        success: data.success
      }
    });
  }

  static captureExportEvent(event: {
    format: string;
    recordCount: number;
    template?: string;
    success: boolean;
  }): void {
    Sentry.addBreadcrumb({
      message: `Export ${event.format} requested`,
      level: 'info',
      category: 'export',
      data: {
        format: event.format,
        recordCount: event.recordCount,
        template: event.template,
        success: event.success
      }
    });
  }

  static captureUserAction(action: string, context?: Record<string, any>): void {
    Sentry.addBreadcrumb({
      message: `User action: ${action}`,
      level: 'info',
      category: 'user-action',
      data: context
    });
  }

  static capturePipelineProgress(progress: {
    step: string;
    progress: number;
    eta?: number;
    keywordsProcessed: number;
  }): void {
    Sentry.addBreadcrumb({
      message: 'Pipeline progress update',
      level: 'info',
      category: 'pipeline-progress',
      data: {
        step: progress.step,
        progress: progress.progress,
        eta: progress.eta,
        keywordsProcessed: progress.keywordsProcessed
      }
    });
  }

  static capturePerformanceMetric(metric: string, value: number, unit: string): void {
    Sentry.addBreadcrumb({
      message: `Performance metric: ${metric}`,
      level: 'info',
      category: 'performance',
      data: {
        metric,
        value,
        unit,
        timestamp: Date.now()
      }
    });
  }

  static captureError(error: Error, context?: SentryContext): void {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setContext(key, context[key]);
        });
      }
      scope.setLevel('error');
      Sentry.captureException(error);
    });
  }

  static setUserContext(user: { id: string; email?: string }): void {
    Sentry.setUser(user);
  }

  static setRunContext(runId: string, metadata?: Record<string, any>): void {
    Sentry.setTag('runId', runId);
    if (metadata) {
      Sentry.setContext('run', metadata);
    }
  }
}

// Simple error boundary wrapper without JSX
export function withSentryErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  options?: {
    showDialog?: boolean;
    beforeCapture?: (scope: Sentry.Scope, error: Error, errorInfo?: unknown) => void;
  }
): ComponentType<P> {
  // Simplified wrapper that just uses Sentry's default error boundary
  return Sentry.withErrorBoundary(Component, {
    showDialog: options?.showDialog || false,
    beforeCapture: (scope, error, errorInfo) => {
      scope.setTag('errorBoundary', true);
      scope.setContext('errorInfo', (errorInfo as unknown as Record<string, any>) || {});
      scope.setLevel('error');
      if (options?.beforeCapture) {
        options.beforeCapture(scope, error as Error, errorInfo);
      }
    }
  });
}

// Simple interaction tracking functions
export const SentryInteraction = {
  captureClick: (element: string, context?: Record<string, any>) => {
    Sentry.addBreadcrumb({
      message: `User clicked: ${element}`,
      level: 'info',
      category: 'ui.click',
      data: context
    });
  },

  captureNavigation: (from: string, to: string) => {
    Sentry.addBreadcrumb({
      message: `Navigation: ${from} -> ${to}`,
      level: 'info',
      category: 'navigation',
      data: { from, to }
    });
  }
};

// Note: Enhanced error boundary component should be implemented in a .tsx file
// if JSX is needed, or use Sentry's built-in error boundary
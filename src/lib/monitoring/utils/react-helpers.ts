'use client';

import { useMemo, useRef, useEffect, createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { trackPerformance } from '../init';
import { createUserActivityTracker, trackClientError } from './frontend-helpers';

// React hook for user activity tracking
export function useUserActivityTracking(userId?: string) {
  return useMemo(() => createUserActivityTracker(userId), [userId]);
}

// React component wrapper for monitoring
export function withMonitoring<P extends object>(
  Component: ComponentType<P>,
  componentName: string
): ComponentType<P> {
  return function MonitoredComponent(props: P): ReactElement {
    const startTime = useRef(performance.now());
    
    useEffect(() => {
      const renderTime = performance.now() - startTime.current;
      trackPerformance(`component_render_${componentName}`, renderTime, {
        componentName
      });
    }, []);
    
    return createElement(Component, props);
  };
}

// Error boundary helper for React
export function createReactErrorBoundary() {
  return {
    onError: (error: Error, errorInfo: any) => {
      trackClientError(error, {
        errorInfo,
        boundary: 'react-error-boundary'
      });
    }
  };
}
'use client';

import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { performanceMonitor } from '../../lib/monitoring';
import { 
  ChartBarIcon, 
  ExclamationTriangleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ServerIcon,
  SignalIcon,
  UserGroupIcon,
  DocumentChartBarIcon
} from '@heroicons/react/24/outline';

interface DashboardData {
  webVitals: {
    LCP: number;
    FID: number;
    CLS: number;
    TTFB: number;
    FCP: number;
  };
  apiMetrics: {
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
    totalCost: number;
  };
  businessMetrics: {
    keywordsProcessed: number;
    clustersCreated: number;
    averageQuality: number;
    conversionRate: number;
  };
  systemHealth: {
    uptime: number;
    responseTime: number;
    cacheHitRate: number;
    errorCount: number;
  };
  alerts: Array<{
    id: string;
    severity: string;
    message: string;
    timestamp: number;
  }>;
}

export function MonitoringDashboard(): ReactElement {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const dashboardData = await performanceMonitor.getDashboardData();
      setData(dashboardData);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <SignalIcon className="h-12 w-12 text-blue-500 animate-pulse mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Dashboard</h2>
          <p className="text-gray-600">Collecting performance metrics...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Unavailable</h2>
          <p className="text-gray-600">Failed to load monitoring data</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Performance Dashboard</h1>
              <p className="text-gray-600 mt-2">
                Dream 100 Keyword Engine - Real-time monitoring and analytics
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10000}>10 seconds</option>
                <option value={30000}>30 seconds</option>
                <option value={60000}>1 minute</option>
                <option value={300000}>5 minutes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alert Banner */}
        {data.alerts.length > 0 && (
          <div className="mb-6">
            <AlertBanner alerts={data.alerts} />
          </div>
        )}

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Web Vitals */}
          <div className="lg:col-span-6">
            <WebVitalsWidget vitals={data.webVitals} />
          </div>

          {/* API Performance */}
          <div className="lg:col-span-6">
            <ApiMetricsWidget metrics={data.apiMetrics} />
          </div>

          {/* System Health */}
          <div className="lg:col-span-4">
            <SystemHealthWidget health={data.systemHealth} />
          </div>

          {/* Business Metrics */}
          <div className="lg:col-span-4">
            <BusinessMetricsWidget metrics={data.businessMetrics} />
          </div>

          {/* Cost Overview */}
          <div className="lg:col-span-4">
            <CostOverviewWidget cost={data.apiMetrics.totalCost} />
          </div>
        </div>

        {/* Detailed Charts Section */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
            <PerformanceTrendChart />
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Error Analysis</h3>
            <ErrorAnalysisChart errorRate={data.apiMetrics.errorRate} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertBanner({ alerts }: { alerts: Array<{ id: string; severity: string; message: string; timestamp: number }> }): ReactElement {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  if (criticalAlerts.length > 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Critical Alerts</h3>
            <div className="mt-2 text-sm text-red-700">
              {criticalAlerts.map(alert => (
                <div key={alert.id} className="mb-1">{alert.message}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (warningAlerts.length > 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex items-center">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800">Warnings</h3>
            <div className="mt-2 text-sm text-yellow-700">
              {warningAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="mb-1">{alert.message}</div>
              ))}
              {warningAlerts.length > 3 && (
                <div className="text-xs">... and {warningAlerts.length - 3} more</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-md p-4">
      <div className="flex items-center">
        <SignalIcon className="h-5 w-5 text-green-400 mr-3" />
        <div>
          <h3 className="text-sm font-medium text-green-800">All Systems Operational</h3>
          <p className="mt-1 text-sm text-green-700">No active alerts</p>
        </div>
      </div>
    </div>
  );
}

function WebVitalsWidget({ vitals }: { vitals: any }): ReactElement {
  const getScoreColor = (metric: string, value: number) => {
    const thresholds = {
      LCP: { good: 2500, fair: 4000 },
      FID: { good: 100, fair: 300 },
      CLS: { good: 0.1, fair: 0.25 },
      TTFB: { good: 800, fair: 1800 },
      FCP: { good: 1800, fair: 3000 }
    };

    const threshold = thresholds[metric as keyof typeof thresholds];
    if (!threshold) return 'text-gray-600';

    if (value <= threshold.good) return 'text-green-600';
    if (value <= threshold.fair) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatValue = (metric: string, value: number) => {
    if (metric === 'CLS') return value.toFixed(3);
    return Math.round(value).toString() + 'ms';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Core Web Vitals</h3>
        <ChartBarIcon className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(vitals).map(([metric, value]) => (
          <div key={metric} className="text-center">
            <div className={`text-2xl font-bold ${getScoreColor(metric, value as number)}`}>
              {formatValue(metric, value as number)}
            </div>
            <div className="text-sm text-gray-500">{metric}</div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <span className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            Good
          </span>
          <span className="flex items-center">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
            Needs Improvement
          </span>
          <span className="flex items-center">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
            Poor
          </span>
        </div>
      </div>
    </div>
  );
}

function ApiMetricsWidget({ metrics }: { metrics: any }): ReactElement {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">API Performance</h3>
        <ClockIcon className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {Math.round(metrics.averageResponseTime)}ms
          </div>
          <div className="text-sm text-gray-500">Avg Response Time</div>
        </div>
        
        <div>
          <div className={`text-2xl font-bold ${metrics.errorRate > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
            {(metrics.errorRate * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500">Error Rate</div>
        </div>
        
        <div>
          <div className="text-2xl font-bold text-purple-600">
            {Math.round(metrics.throughput)}
          </div>
          <div className="text-sm text-gray-500">Requests/min</div>
        </div>
        
        <div>
          <div className="text-2xl font-bold text-orange-600">
            ${metrics.totalCost.toFixed(2)}
          </div>
          <div className="text-sm text-gray-500">Total Cost</div>
        </div>
      </div>
    </div>
  );
}

function SystemHealthWidget({ health }: { health: any }): ReactElement {
  const formatUptime = (uptime: number) => {
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
        <ServerIcon className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Uptime</span>
          <span className="font-medium">{formatUptime(health.uptime)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Response Time</span>
          <span className={`font-medium ${health.responseTime > 1000 ? 'text-red-600' : 'text-green-600'}`}>
            {Math.round(health.responseTime)}ms
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Cache Hit Rate</span>
          <span className={`font-medium ${health.cacheHitRate > 0.8 ? 'text-green-600' : 'text-yellow-600'}`}>
            {(health.cacheHitRate * 100).toFixed(1)}%
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Errors (24h)</span>
          <span className={`font-medium ${health.errorCount > 10 ? 'text-red-600' : 'text-green-600'}`}>
            {health.errorCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function BusinessMetricsWidget({ metrics }: { metrics: any }): ReactElement {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Business Metrics</h3>
        <DocumentChartBarIcon className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Keywords Processed</span>
          <span className="font-medium text-blue-600">{metrics.keywordsProcessed.toLocaleString()}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Clusters Created</span>
          <span className="font-medium text-green-600">{metrics.clustersCreated}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Avg Quality</span>
          <span className={`font-medium ${metrics.averageQuality > 0.8 ? 'text-green-600' : 'text-yellow-600'}`}>
            {(metrics.averageQuality * 100).toFixed(1)}%
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Conversion Rate</span>
          <span className="font-medium text-purple-600">{(metrics.conversionRate * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function CostOverviewWidget({ cost }: { cost: number }): ReactElement {
  const dailyBudget = 50; // Example daily budget
  const utilization = (cost / dailyBudget) * 100;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Cost Overview</h3>
        <CurrencyDollarIcon className="h-5 w-5 text-gray-400" />
      </div>
      
      <div className="mb-4">
        <div className="text-3xl font-bold text-gray-900">${cost.toFixed(2)}</div>
        <div className="text-sm text-gray-500">Today's spend</div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span>Budget utilization</span>
          <span>{utilization.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${
              utilization > 90 ? 'bg-red-500' : utilization > 70 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          ></div>
        </div>
      </div>
      
      <div className="text-xs text-gray-500">
        Daily budget: ${dailyBudget.toFixed(2)}
      </div>
    </div>
  );
}

function PerformanceTrendChart(): ReactElement {
  // Simplified chart component - would integrate with actual charting library
  return (
    <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
      <div className="text-center">
        <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500">Performance trend chart</p>
        <p className="text-xs text-gray-400">Would integrate with Chart.js or similar</p>
      </div>
    </div>
  );
}

function ErrorAnalysisChart({ errorRate }: { errorRate: number }): ReactElement {
  return (
    <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
      <div className="text-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500">Error analysis chart</p>
        <p className="text-sm text-gray-600">Current error rate: {(errorRate * 100).toFixed(1)}%</p>
      </div>
    </div>
  );
}
import { UserActivity, FeatureUsage } from './types';
import { MonitoringConfig } from './config';
import * as Sentry from '@sentry/nextjs';

interface UserSession {
  sessionId: string;
  userId: string;
  startTime: Date;
  lastActivity: Date;
  activities: UserActivity[];
  metadata?: Record<string, any>;
}

interface UserMetrics {
  userId: string;
  totalSessions: number;
  totalActions: number;
  avgSessionDuration: number;
  lastSeen: Date;
  favoriteFeatures: string[];
  conversionEvents: number;
}

export class UserActivityTracker {
  private config: MonitoringConfig;
  private activities: UserActivity[] = [];
  private sessions: Map<string, UserSession> = new Map();
  private userMetrics: Map<string, UserMetrics> = new Map();
  private featureUsage: Map<string, FeatureUsage> = new Map();
  private activityQueue: UserActivity[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: MonitoringConfig) {
    this.config = config;
    
    if (this.config.businessMetrics.enableUserTracking) {
      this.startPeriodicFlush();
    }
  }

  startSession(
    userId: string,
    sessionId?: string,
    metadata?: Record<string, any>
  ): string {
    const actualSessionId = sessionId || this.generateSessionId();
    
    const session: UserSession = {
      sessionId: actualSessionId,
      userId,
      startTime: new Date(),
      lastActivity: new Date(),
      activities: [],
      metadata
    };
    
    this.sessions.set(actualSessionId, session);
    
    // Track session start
    this.trackActivity(userId, actualSessionId, 'session_start', 'core', metadata);
    
    // Set user context in Sentry
    Sentry.setUser({
      id: userId,
      ...metadata
    });
    
    Sentry.setTag('sessionId', actualSessionId);
    
    return actualSessionId;
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const sessionDuration = Date.now() - session.startTime.getTime();
    
    // Track session end
    this.trackActivity(
      session.userId,
      sessionId,
      'session_end',
      'core',
      {
        duration: sessionDuration,
        activityCount: session.activities.length
      }
    );
    
    // Update user metrics
    this.updateUserMetrics(session.userId, session);
    
    // Remove session
    this.sessions.delete(sessionId);
  }

  trackActivity(
    userId: string,
    sessionId: string,
    action: string,
    feature: string,
    metadata?: Record<string, any>,
    duration?: number
  ): void {
    if (!this.config.businessMetrics.enableUserTracking) return;

    const activity: UserActivity = {
      userId,
      sessionId,
      action,
      feature,
      timestamp: new Date(),
      metadata,
      duration
    };

    this.activities.push(activity);
    this.activityQueue.push(activity);

    // Update session
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      session.activities.push(activity);
    }

    // Update feature usage
    this.updateFeatureUsage(feature, userId, sessionId);

    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `User action: ${action} in ${feature}`,
      level: 'info',
      category: 'user_activity',
      data: {
        userId,
        sessionId,
        action,
        feature,
        duration,
        ...metadata
      }
    });

    // Track important events with custom scope
    if (this.isImportantAction(action)) {
      Sentry.withScope(scope => {
        scope.setTag('importantUserAction', true);
        scope.setTag('feature', feature);
        scope.setContext('userActivity', {
          userId,
          sessionId,
          action,
          feature,
          timestamp: activity.timestamp,
          ...metadata
        });
        
        Sentry.captureMessage(`Important user action: ${action}`, 'info');
      });
    }

    // Auto-flush if queue is full
    if (this.activityQueue.length >= this.config.businessMetrics.batchSize) {
      this.flushActivities();
    }
  }

  trackPageView(
    userId: string,
    sessionId: string,
    page: string,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'page_view', 'navigation', {
      page,
      ...metadata
    });
  }

  trackFeatureUsage(
    userId: string,
    sessionId: string,
    feature: string,
    subFeature?: string,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'feature_used', feature, {
      subFeature,
      ...metadata
    });
  }

  trackButtonClick(
    userId: string,
    sessionId: string,
    buttonId: string,
    context: string,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'button_click', 'ui', {
      buttonId,
      context,
      ...metadata
    });
  }

  trackFormSubmission(
    userId: string,
    sessionId: string,
    formType: string,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'form_submit', 'forms', {
      formType,
      success,
      ...metadata
    });
  }

  trackSearch(
    userId: string,
    sessionId: string,
    query: string,
    resultsCount: number,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'search', 'search', {
      queryLength: query.length,
      resultsCount,
      hasResults: resultsCount > 0,
      ...metadata
    });
  }

  trackError(
    userId: string,
    sessionId: string,
    errorType: string,
    errorMessage: string,
    context?: string,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'error_encountered', 'error', {
      errorType,
      errorMessage: errorMessage.substring(0, 100), // Limit length
      context,
      ...metadata
    });
  }

  trackConversion(
    userId: string,
    sessionId: string,
    conversionType: string,
    value?: number,
    metadata?: Record<string, any>
  ): void {
    this.trackActivity(userId, sessionId, 'conversion', 'conversion', {
      conversionType,
      value,
      ...metadata
    });

    // Update user metrics
    const userMetrics = this.userMetrics.get(userId);
    if (userMetrics) {
      userMetrics.conversionEvents++;
    }
  }

  private updateFeatureUsage(feature: string, userId: string, sessionId: string): void {
    const existing = this.featureUsage.get(feature);
    const now = new Date();
    
    if (existing) {
      // Update existing feature usage
      if (!existing.users || existing.users < 1000) { // Prevent overflow
        existing.users++;
      }
      existing.actions++;
      existing.timestamp = now;
    } else {
      // Create new feature usage record
      this.featureUsage.set(feature, {
        feature,
        users: 1,
        sessions: 1,
        actions: 1,
        period: '24h',
        timestamp: now
      });
    }
  }

  private updateUserMetrics(userId: string, session: UserSession): void {
    const existing = this.userMetrics.get(userId);
    const sessionDuration = Date.now() - session.startTime.getTime();
    
    if (existing) {
      existing.totalSessions++;
      existing.totalActions += session.activities.length;
      existing.avgSessionDuration = (
        (existing.avgSessionDuration * (existing.totalSessions - 1)) + sessionDuration
      ) / existing.totalSessions;
      existing.lastSeen = session.lastActivity;
      
      // Update favorite features
      const sessionFeatures = Array.from(new Set(session.activities.map(a => a.feature)));
      sessionFeatures.forEach(feature => {
        if (!existing.favoriteFeatures.includes(feature)) {
          existing.favoriteFeatures.push(feature);
        }
      });
      
      // Keep only top 5 favorite features
      if (existing.favoriteFeatures.length > 5) {
        existing.favoriteFeatures = existing.favoriteFeatures.slice(0, 5);
      }
    } else {
      const sessionFeatures = Array.from(new Set(session.activities.map(a => a.feature)));
      
      this.userMetrics.set(userId, {
        userId,
        totalSessions: 1,
        totalActions: session.activities.length,
        avgSessionDuration: sessionDuration,
        lastSeen: session.lastActivity,
        favoriteFeatures: sessionFeatures.slice(0, 5),
        conversionEvents: 0
      });
    }
  }

  getUserMetrics(userId: string): UserMetrics | null {
    return this.userMetrics.get(userId) || null;
  }

  getActiveSession(sessionId: string): UserSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getActiveSessions(): UserSession[] {
    return Array.from(this.sessions.values());
  }

  getUserActivities(
    userId: string,
    timeWindow: number = 86400000, // 24 hours
    limit: number = 100
  ): UserActivity[] {
    const cutoff = new Date(Date.now() - timeWindow);
    
    return this.activities
      .filter(activity => 
        activity.userId === userId && activity.timestamp > cutoff
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getFeatureUsageStats(timeWindow: number = 86400000): FeatureUsage[] {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentActivities = this.activities.filter(
      activity => activity.timestamp > cutoff
    );

    const featureStats = new Map<string, {
      users: Set<string>;
      sessions: Set<string>;
      actions: number;
      totalDuration: number;
      durationCount: number;
    }>();

    recentActivities.forEach(activity => {
      if (!featureStats.has(activity.feature)) {
        featureStats.set(activity.feature, {
          users: new Set(),
          sessions: new Set(),
          actions: 0,
          totalDuration: 0,
          durationCount: 0
        });
      }

      const stats = featureStats.get(activity.feature)!;
      stats.users.add(activity.userId);
      stats.sessions.add(activity.sessionId);
      stats.actions++;
      
      if (activity.duration) {
        stats.totalDuration += activity.duration;
        stats.durationCount++;
      }
    });

    return Array.from(featureStats.entries()).map(([feature, stats]) => ({
      feature,
      users: stats.users.size,
      sessions: stats.sessions.size,
      actions: stats.actions,
      avgDuration: stats.durationCount > 0 
        ? stats.totalDuration / stats.durationCount 
        : undefined,
      period: `${timeWindow / 3600000}h`,
      timestamp: new Date()
    }));
  }

  getUserBehaviorInsights(userId: string): {
    activityPatterns: Record<string, number>;
    peakHours: number[];
    commonSequences: Array<{ sequence: string[]; count: number }>;
    engagementScore: number;
  } {
    const userActivities = this.getUserActivities(userId, 7 * 24 * 60 * 60 * 1000); // Last 7 days
    
    // Activity patterns by feature
    const activityPatterns: Record<string, number> = {};
    userActivities.forEach(activity => {
      activityPatterns[activity.feature] = (activityPatterns[activity.feature] || 0) + 1;
    });

    // Peak hours (0-23)
    const hourCounts = new Array(24).fill(0);
    userActivities.forEach(activity => {
      const hour = activity.timestamp.getHours();
      hourCounts[hour]++;
    });
    
    const maxCount = Math.max(...hourCounts);
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count > maxCount * 0.7) // Top 30% of hours
      .map(item => item.hour);

    // Common action sequences (simplified)
    const sequences: string[][] = [];
    for (let i = 0; i < userActivities.length - 2; i++) {
      const sequence = userActivities.slice(i, i + 3).map(a => a.action);
      sequences.push(sequence);
    }
    
    const sequenceCounts = new Map<string, number>();
    sequences.forEach(seq => {
      const key = seq.join(' -> ');
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    });
    
    const commonSequences = Array.from(sequenceCounts.entries())
      .map(([sequence, count]) => ({ sequence: sequence.split(' -> '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Engagement score (0-100)
    const metrics = this.getUserMetrics(userId);
    let engagementScore = 0;
    
    if (metrics) {
      const sessionScore = Math.min(metrics.totalSessions * 2, 30); // Max 30 points
      const actionScore = Math.min(metrics.totalActions / 10, 25); // Max 25 points
      const durationScore = Math.min(metrics.avgSessionDuration / 60000, 20); // Max 20 points (1 min = 1 point)
      const featureScore = metrics.favoriteFeatures.length * 5; // Max 25 points
      
      engagementScore = sessionScore + actionScore + durationScore + featureScore;
    }

    return {
      activityPatterns,
      peakHours,
      commonSequences,
      engagementScore: Math.min(engagementScore, 100)
    };
  }

  getActivitySummary(timeWindow: number = 86400000): {
    totalUsers: number;
    totalSessions: number;
    totalActions: number;
    avgSessionDuration: number;
    topFeatures: Array<{ feature: string; usage: number }>;
    activeUsers: number;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentActivities = this.activities.filter(
      activity => activity.timestamp > cutoff
    );

    const uniqueUsers = new Set(recentActivities.map(a => a.userId));
    const uniqueSessions = new Set(recentActivities.map(a => a.sessionId));
    
    // Calculate average session duration
    const sessionDurations: number[] = [];
    this.sessions.forEach(session => {
      if (session.startTime > cutoff) {
        const duration = session.lastActivity.getTime() - session.startTime.getTime();
        sessionDurations.push(duration);
      }
    });
    
    const avgSessionDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length
      : 0;

    // Top features
    const featureCounts: Record<string, number> = {};
    recentActivities.forEach(activity => {
      featureCounts[activity.feature] = (featureCounts[activity.feature] || 0) + 1;
    });
    
    const topFeatures = Object.entries(featureCounts)
      .map(([feature, usage]) => ({ feature, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    // Active users (users with activity in last hour)
    const activeUsersCutoff = new Date(Date.now() - 3600000); // 1 hour
    const activeUsers = new Set(
      this.activities
        .filter(activity => activity.timestamp > activeUsersCutoff)
        .map(a => a.userId)
    ).size;

    return {
      totalUsers: uniqueUsers.size,
      totalSessions: uniqueSessions.size,
      totalActions: recentActivities.length,
      avgSessionDuration,
      topFeatures,
      activeUsers
    };
  }

  private isImportantAction(action: string): boolean {
    const importantActions = [
      'conversion',
      'form_submit',
      'purchase',
      'signup',
      'login',
      'error_encountered',
      'feature_used'
    ];
    
    return importantActions.includes(action);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(
      () => this.flushActivities(),
      this.config.businessMetrics.flushInterval
    );
  }

  private flushActivities(): void {
    if (this.activityQueue.length === 0) return;

    // Group activities by type for batch processing
    const activitiesByFeature = new Map<string, UserActivity[]>();
    
    this.activityQueue.forEach(activity => {
      const feature = activity.feature;
      if (!activitiesByFeature.has(feature)) {
        activitiesByFeature.set(feature, []);
      }
      activitiesByFeature.get(feature)!.push(activity);
    });

    // Send summary to Sentry
    Sentry.withScope(scope => {
      scope.setTag('userActivityFlush', true);
      scope.setContext('activityBatch', {
        totalActivities: this.activityQueue.length,
        uniqueUsers: new Set(this.activityQueue.map(a => a.userId)).size,
        uniqueSessions: new Set(this.activityQueue.map(a => a.sessionId)).size,
        timeRange: {
          start: this.activityQueue[0]?.timestamp,
          end: this.activityQueue[this.activityQueue.length - 1]?.timestamp
        }
      });
      
      Sentry.captureMessage('User activity batch flushed', 'info');
    });

    // Clear the queue
    this.activityQueue = [];
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - (this.config.retention.metrics * 24 * 60 * 60 * 1000));
    
    // Clean up old activities
    this.activities = this.activities.filter(activity => activity.timestamp > cutoff);
    
    // Clean up inactive sessions (older than 24 hours)
    const sessionCutoff = new Date(Date.now() - 86400000);
    this.sessions.forEach((session, sessionId) => {
      if (session.lastActivity < sessionCutoff) {
        this.endSession(sessionId);
      }
    });
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushActivities();
  }
}
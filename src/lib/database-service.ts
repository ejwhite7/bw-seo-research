// Enhanced Database Service with Security and Performance Optimizations
import { supabase, supabaseAdmin, DatabaseService } from './supabase'
import { 
  Database, 
  RunSettings, 
  ApiUsage, 
  RunProgress, 
  EditorialRoadmapCSV, 
  KeywordUniverseCSV 
} from '../types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export class EnhancedDatabaseService {
  // Rate limiting check
  static async checkRateLimit(
    userId: string, 
    endpoint: string, 
    maxRequests: number = 1000, 
    windowDuration: string = '1 hour'
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: userId,
      p_api_endpoint: endpoint,
      p_max_requests: maxRequests,
      p_window_duration: windowDuration
    })
    
    return { data, error }
  }

  // Secure API key storage
  static async storeApiKeys(
    userId: string,
    ahrefsKey?: string,
    anthropicKey?: string
  ): Promise<{ data: any; error: any }> {
    const updates: any = {}
    
    if (ahrefsKey) {
      const { data: encryptedAhrefs, error: ahrefsError } = await supabaseAdmin.rpc(
        'encrypt_api_key_versioned', 
        { api_key: ahrefsKey }
      )
      if (ahrefsError) throw ahrefsError
      updates.ahrefs_api_key_encrypted = JSON.stringify(encryptedAhrefs)
    }
    
    if (anthropicKey) {
      const { data: encryptedAnthropic, error: anthropicError } = await supabaseAdmin.rpc(
        'encrypt_api_key_versioned', 
        { api_key: anthropicKey }
      )
      if (anthropicError) throw anthropicError
      updates.anthropic_api_key_encrypted = JSON.stringify(encryptedAnthropic)
    }
    
    const { data, error } = await supabaseAdmin
      .from('settings')
      .upsert({
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    // Log the API key update
    await this.logAuditEvent(userId, 'API_KEY_UPDATE', 'settings', data?.id)
    
    return { data, error }
  }

  // Retrieve and decrypt API keys
  static async getApiKeys(userId: string): Promise<{ data: { ahrefs_api_key: string | null; anthropic_api_key: string | null } | null; error: any }> {
    const { data: settings, error } = await supabaseAdmin
      .from('settings')
      .select('ahrefs_api_key_encrypted, anthropic_api_key_encrypted')
      .eq('user_id', userId)
      .single()
    
    if (error || !settings) return { data: null, error }
    
    let ahrefsKey = null
    let anthropicKey = null
    
    if (settings.ahrefs_api_key_encrypted) {
      const { data: decryptedAhrefs } = await supabaseAdmin.rpc(
        'decrypt_api_key_versioned',
        { encrypted_data: JSON.parse(settings.ahrefs_api_key_encrypted) }
      )
      ahrefsKey = decryptedAhrefs
    }
    
    if (settings.anthropic_api_key_encrypted) {
      const { data: decryptedAnthropic } = await supabaseAdmin.rpc(
        'decrypt_api_key_versioned',
        { encrypted_data: JSON.parse(settings.anthropic_api_key_encrypted) }
      )
      anthropicKey = decryptedAnthropic
    }
    
    return {
      data: {
        ahrefs_api_key: ahrefsKey,
        anthropic_api_key: anthropicKey
      },
      error: null
    }
  }

  // Delegate to base service methods
  static getUserRuns = DatabaseService.getUserRuns;
  static getRunWithData = DatabaseService.getRunWithData;
  static getClusterWithKeywords = DatabaseService.getClusterWithKeywords;
  static getUserSettings = DatabaseService.getUserSettings;
  static updateRunProgress = DatabaseService.updateRunProgress;
  static bulkInsertKeywords = DatabaseService.bulkInsertKeywords;
  static bulkInsertClusters = DatabaseService.bulkInsertClusters;
  static getKeywordsPaginated = DatabaseService.getKeywordsPaginated;
  static getClusterAnalytics = DatabaseService.getClusterAnalytics;
  static refreshClusterAnalytics = DatabaseService.refreshClusterAnalytics;
  static deleteRun = DatabaseService.deleteRun;
  static encryptApiKey = DatabaseService.encryptApiKey;
  static decryptApiKey = DatabaseService.decryptApiKey;
  static getEditorialRoadmapForExport = DatabaseService.getEditorialRoadmapForExport;
  static getKeywordUniverseForExport = DatabaseService.getKeywordUniverseForExport;
  static getRunMetrics = DatabaseService.getRunMetrics;

  // Enhanced run creation with validation and audit logging
  static async createRun(
    userId: string,
    seedKeywords: string[],
    settings: RunSettings = {},
    clientInfo?: { ip?: string, userAgent?: string }
  ): Promise<{ data: any; error: any }> {
    // Set client info for audit logging
    if (clientInfo?.ip) {
      await supabaseAdmin.rpc('set_config', {
        setting_name: 'app.client_ip',
        new_value: clientInfo.ip,
        is_local: false
      })
    }
    if (clientInfo?.userAgent) {
      await supabaseAdmin.rpc('set_config', {
        setting_name: 'app.user_agent',
        new_value: clientInfo.userAgent,
        is_local: false
      })
    }
    
    // Validate input
    if (seedKeywords.length === 0 || seedKeywords.length > 5) {
      throw new Error('Must provide 1-5 seed keywords')
    }
    
    // Check rate limit
    const { data: rateLimitCheck } = await this.checkRateLimit(userId, 'create_run', 10)
    if (rateLimitCheck && !rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again at ${rateLimitCheck.reset_time}`)
    }
    
    const runData = {
      user_id: userId,
      seed_keywords: seedKeywords,
      market: settings.market || 'US-EN',
      status: 'pending' as const,
      settings: {
        max_keywords: settings.max_keywords || 10000,
        max_dream100: settings.max_dream100 || 100,
        max_tier2_per_dream: settings.max_tier2_per_dream || 10,
        max_tier3_per_tier2: settings.max_tier3_per_tier2 || 10,
        scoring_weights: settings.scoring_weights || {
          dream100: { volume: 0.40, intent: 0.30, relevance: 0.15, trend: 0.10, ease: 0.05 },
          tier2: { volume: 0.35, ease: 0.25, relevance: 0.20, intent: 0.15, trend: 0.05 },
          tier3: { ease: 0.35, relevance: 0.30, volume: 0.20, intent: 0.10, trend: 0.05 }
        },
        enable_competitor_scraping: settings.enable_competitor_scraping !== false,
        similarity_threshold: settings.similarity_threshold || 0.75,
        quick_win_threshold: settings.quick_win_threshold || 0.70,
        ...settings
      },
      api_usage: {},
      progress: {
        current_stage: 'initialization',
        stages_completed: [],
        keywords_discovered: 0,
        clusters_created: 0,
        competitors_found: 0,
        percent_complete: 0
      }
    }
    
    const { data, error } = await supabaseAdmin
      .from('runs')
      .insert(runData)
      .select()
      .single()
    
    if (data) {
      await this.logAuditEvent(userId, 'RUN_CREATED', 'runs', data.id, null, runData)
    }
    
    return { data, error }
  }

  // Enhanced keyword search with full-text search and ranking
  static async searchKeywords(runId: string, searchTerm: string, limit: number = 50): Promise<{ data: any; error: any }> {
    const { data, error } = await supabaseAdmin.rpc('search_keywords_ranked', {
      p_run_id: runId,
      p_search_term: searchTerm,
      p_limit: limit
    })
    
    return { data, error }
  }

  // Enhanced cluster search
  static async searchClusters(runId: string, searchTerm: string, limit: number = 20): Promise<{ data: any; error: any }> {
    const { data, error } = await supabaseAdmin.rpc('search_clusters_ranked', {
      p_run_id: runId,
      p_search_term: searchTerm,
      p_limit: limit
    })
    
    return { data, error }
  }

  // Bulk operations with batch processing
  static async bulkUpdateKeywords(
    runId: string,
    updates: Array<{
      id: string
      cluster_id?: string
      blended_score?: number
      quick_win?: boolean
      [key: string]: any
    }>
  ): Promise<{ error: any | null }> {
    const results = await Promise.allSettled(
      updates.map(update => 
        supabaseAdmin
          .from('keywords')
          .update(update)
          .eq('id', update.id)
          .eq('run_id', runId) // Security check
      )
    )
    
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason)
    
    return { error: errors.length > 0 ? errors[0] : null }
  }

  // Generate CSV exports with proper formatting
  static async generateEditorialRoadmapCSV(runId: string): Promise<string> {
    const { data, error } = await DatabaseService.getEditorialRoadmapForExport(runId)
    if (error || !data) throw error || new Error('No roadmap data found')
    
    const csvData: EditorialRoadmapCSV[] = data.map((item: any) => ({
      post_id: item.post_id,
      cluster_label: item.cluster?.label || 'Unclustered',
      stage: item.stage,
      primary_keyword: item.primary_keyword,
      secondary_keywords: item.secondary_keywords?.join('|') || '',
      intent: item.intent,
      volume: item.volume,
      difficulty: item.difficulty,
      blended_score: item.blended_score,
      quick_win: item.quick_win,
      suggested_title: item.suggested_title,
      dri: item.dri,
      due_date: item.due_date,
      notes: item.notes,
      source_urls: item.source_urls?.join('|') || '',
      run_id: item.run_id
    }))
    
    return this.convertToCSV(csvData)
  }
  
  static async generateKeywordUniverseCSV(runId: string): Promise<string> {
    const { data, error } = await DatabaseService.getKeywordUniverseForExport(runId)
    if (error || !data) throw error || new Error('No keyword data found')
    
    const csvData: KeywordUniverseCSV[] = data.map((keyword: any) => ({
      keyword: keyword.keyword,
      tier: keyword.stage,
      cluster_label: keyword.cluster?.label || null,
      volume: keyword.volume,
      difficulty: keyword.difficulty,
      intent: keyword.intent,
      relevance: keyword.relevance,
      trend: keyword.trend,
      blended_score: keyword.blended_score,
      quick_win: keyword.quick_win,
      canonical_keyword: keyword.canonical_keyword,
      top_serp_urls: keyword.top_serp_urls?.join('|') || ''
    }))
    
    return this.convertToCSV(csvData)
  }

  // CSV conversion utility
  private static convertToCSV(data: any[]): string {
    if (data.length === 0) return ''
    
    const headers = Object.keys(data[0])
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header]
          const stringValue = value === null || value === undefined ? '' : String(value)
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return '"' + stringValue.replace(/"/g, '""') + '"'
          }
          return stringValue
        }).join(',')
      )
    ]
    
    return csvRows.join('\n')
  }

  // Audit logging helper
  static async logAuditEvent(
    userId: string,
    action: string,
    tableName: string,
    recordId?: string,
    oldValues?: any,
    newValues?: any
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: userId,
          action,
          table_name: tableName,
          record_id: recordId,
          old_values: oldValues,
          new_values: newValues
        })
    } catch (error) {
      console.error('Failed to log audit event:', error)
    }
  }

  // Performance monitoring
  static async getPerformanceMetrics(runId: string): Promise<{ run: any; performance: any; error: any }> {
    const startTime = Date.now()
    
    const [
      runData,
      keywordCounts,
      clusterAnalytics,
      roadmapCounts
    ] = await Promise.all([
      supabaseAdmin.from('runs').select('*').eq('id', runId).single(),
      supabaseAdmin.from('keywords')
        .select('stage, quick_win', { count: 'exact' })
        .eq('run_id', runId),
      supabaseAdmin.from('cluster_analytics')
        .select('*')
        .eq('run_id', runId),
      supabaseAdmin.from('roadmap_items')
        .select('stage', { count: 'exact' })
        .eq('run_id', runId)
    ])
    
    const queryTime = Date.now() - startTime
    
    // Calculate stage distribution
    const stageCounts: Record<'dream100' | 'tier2' | 'tier3', number> = { dream100: 0, tier2: 0, tier3: 0 }
    const quickWinsByStage: Record<'dream100' | 'tier2' | 'tier3', number> = { dream100: 0, tier2: 0, tier3: 0 }
    
    keywordCounts.data?.forEach((row: any) => {
      if (row.stage && row.stage in stageCounts) {
        stageCounts[row.stage as keyof typeof stageCounts]++
        if (row.quick_win) quickWinsByStage[row.stage as keyof typeof quickWinsByStage]++
      }
    })
    
    // Calculate roadmap distribution
    const roadmapDistribution: Record<'pillar' | 'supporting', number> = { pillar: 0, supporting: 0 }
    roadmapCounts.data?.forEach((row: any) => {
      if (row.stage && row.stage in roadmapDistribution) {
        roadmapDistribution[row.stage as keyof typeof roadmapDistribution]++
      }
    })
    
    return {
      run: runData.data,
      performance: {
        query_time_ms: queryTime,
        total_keywords: keywordCounts.count || 0,
        total_clusters: clusterAnalytics.data?.length || 0,
        stage_counts: stageCounts,
        quick_wins_by_stage: quickWinsByStage,
        roadmap_counts: roadmapDistribution,
        cluster_analytics: clusterAnalytics.data || []
      },
      error: runData.error || keywordCounts.error || clusterAnalytics.error || roadmapCounts.error
    }
  }

  // Data cleanup and maintenance
  static async cleanupOldData(): Promise<{ deletedCount: any; error: any }> {
    const { data, error } = await supabaseAdmin.rpc('cleanup_old_data')
    return { deletedCount: data, error }
  }

  // Health check
  static async healthCheck(): Promise<{ healthy: boolean; response_time_ms: number; error?: string }> {
    const startTime = Date.now()
    
    try {
      const { data, error } = await supabaseAdmin
        .from('runs')
        .select('count', { count: 'exact', head: true })
        .limit(1)
      
      const responseTime = Date.now() - startTime
      
      return {
        healthy: !error,
        response_time_ms: responseTime,
        error: error?.message
      }
    } catch (error) {
      return {
        healthy: false,
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Advanced analytics queries
  static async getRunComparison(userId: string, runIds: string[]): Promise<{ data: any; error: any }> {
    const { data, error } = await supabaseAdmin
      .from('run_summaries')
      .select('*')
      .eq('user_id', userId)
      .in('id', runIds)
      .order('created_at', { ascending: false })
    
    return { data, error }
  }

  static async getUserAnalytics(userId: string, days: number = 30): Promise<{ data: any; error: any }> {
    const { data, error } = await supabaseAdmin
      .from('run_summaries')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    if (error) return { data: null, error }
    
    const analytics = {
      total_runs: data.length,
      completed_runs: data.filter(r => r.status === 'completed').length,
      total_keywords: data.reduce((sum, r) => sum + (r.total_keywords || 0), 0),
      total_clusters: data.reduce((sum, r) => sum + (r.total_clusters || 0), 0),
      total_quick_wins: data.reduce((sum, r) => sum + (r.quick_win_count || 0), 0),
      avg_completion_time: this.calculateAverageCompletionTime(data),
      success_rate: data.length > 0 ? data.filter(r => r.status === 'completed').length / data.length : 0
    }
    
    return { data: analytics, error: null }
  }
  
  private static calculateAverageCompletionTime(runs: any[]): number {
    const completedRuns = runs.filter(r => r.status === 'completed' && r.completed_at)
    if (completedRuns.length === 0) return 0
    
    const totalTime = completedRuns.reduce((sum, run) => {
      const start = new Date(run.created_at).getTime()
      const end = new Date(run.completed_at).getTime()
      return sum + (end - start)
    }, 0)
    
    return Math.round(totalTime / completedRuns.length / 1000) // Return in seconds
  }
}

export default EnhancedDatabaseService
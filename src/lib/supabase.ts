// Supabase Client Configuration for Dream 100 Keyword Engine
import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

// Environment variables for Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client-side Supabase client (with RLS enabled)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (bypasses RLS for system operations)
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Type-safe table helpers
export const Tables = {
  runs: () => supabase.from('runs'),
  clusters: () => supabase.from('clusters'),
  keywords: () => supabase.from('keywords'),
  competitors: () => supabase.from('competitors'),
  roadmapItems: () => supabase.from('roadmap_items'),
  settings: () => supabase.from('settings'),
  clusterAnalytics: () => supabase.from('cluster_analytics')
} as const

export const AdminTables = {
  runs: () => supabaseAdmin.from('runs'),
  clusters: () => supabaseAdmin.from('clusters'),
  keywords: () => supabaseAdmin.from('keywords'),
  competitors: () => supabaseAdmin.from('competitors'),
  roadmapItems: () => supabaseAdmin.from('roadmap_items'),
  settings: () => supabaseAdmin.from('settings'),
  clusterAnalytics: () => supabaseAdmin.from('cluster_analytics')
} as const

// Database utility functions
export class DatabaseService {
  // Get user's runs with optional filtering
  static async getUserRuns(userId: string, limit?: number) {
    let query = Tables.runs()
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    return query
  }

  // Get run with all related data
  static async getRunWithData(runId: string) {
    const [run, keywords, clusters, competitors, roadmapItems] = await Promise.all([
      Tables.runs().select('*').eq('id', runId).single(),
      Tables.keywords().select('*').eq('run_id', runId).order('blended_score', { ascending: false }),
      Tables.clusters().select('*').eq('run_id', runId).order('score', { ascending: false }),
      Tables.competitors().select('*').eq('run_id', runId),
      Tables.roadmapItems().select('*').eq('run_id', runId).order('due_date', { ascending: true })
    ])

    return {
      run: run.data,
      keywords: keywords.data || [],
      clusters: clusters.data || [],
      competitors: competitors.data || [],
      roadmapItems: roadmapItems.data || [],
      error: run.error || keywords.error || clusters.error || competitors.error || roadmapItems.error
    }
  }

  // Get cluster with its keywords
  static async getClusterWithKeywords(clusterId: string) {
    const [cluster, keywords] = await Promise.all([
      Tables.clusters().select('*').eq('id', clusterId).single(),
      Tables.keywords().select('*').eq('cluster_id', clusterId).order('blended_score', { ascending: false })
    ])

    return {
      cluster: cluster.data,
      keywords: keywords.data || [],
      error: cluster.error || keywords.error
    }
  }

  // Get user settings or create default ones
  static async getUserSettings(userId: string) {
    const { data: settings, error } = await Tables.settings()
      .select('*')
      .eq('user_id', userId)
      .single()

    // If no settings exist, create default ones
    if (error && error.code === 'PGRST116') {
      const { data: newSettings, error: insertError } = await Tables.settings()
        .insert({
          user_id: userId,
          default_weights: {
            dream100: { volume: 0.40, intent: 0.30, relevance: 0.15, trend: 0.10, ease: 0.05 },
            tier2: { volume: 0.35, ease: 0.25, relevance: 0.20, intent: 0.15, trend: 0.05 },
            tier3: { ease: 0.35, relevance: 0.30, volume: 0.20, intent: 0.10, trend: 0.05 }
          },
          other_preferences: {}
        })
        .select()
        .single()

      return { data: newSettings, error: insertError }
    }

    return { data: settings, error }
  }

  // Update run progress using stored function (bypasses RLS)
  static async updateRunProgress(
    runId: string,
    status?: Database['public']['Enums']['run_status'],
    progress?: any,
    apiUsage?: any,
    error?: any
  ) {
    return supabaseAdmin.rpc('update_run_progress', {
      run_id: runId,
      new_status: status,
      progress_data: progress,
      api_usage_data: apiUsage,
      error_data: error
    })
  }

  // Bulk insert keywords using stored function for performance
  static async bulkInsertKeywords(keywordsData: any[]) {
    return supabaseAdmin.rpc('bulk_insert_keywords', {
      keywords_data: keywordsData
    })
  }

  // Bulk insert clusters using stored function for performance
  static async bulkInsertClusters(clustersData: any[]) {
    return supabaseAdmin.rpc('bulk_insert_clusters', {
      clusters_data: clustersData
    })
  }

  // Get keywords with pagination and filtering
  static async getKeywordsPaginated(
    runId: string,
    page: number = 1,
    pageSize: number = 100,
    stage?: Database['public']['Enums']['keyword_stage'],
    quickWinOnly?: boolean
  ) {
    let query = Tables.keywords()
      .select('*')
      .eq('run_id', runId)
      .order('blended_score', { ascending: false })

    if (stage) {
      query = query.eq('stage', stage)
    }

    if (quickWinOnly) {
      query = query.eq('quick_win', true)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    return query.range(from, to)
  }

  // Search keywords
  static async searchKeywords(runId: string, searchTerm: string) {
    return Tables.keywords()
      .select('*')
      .eq('run_id', runId)
      .ilike('keyword', `%${searchTerm}%`)
      .order('blended_score', { ascending: false })
      .limit(50)
  }

  // Get cluster analytics
  static async getClusterAnalytics(runId: string) {
    return Tables.clusterAnalytics()
      .select('*')
      .eq('run_id', runId)
      .order('score', { ascending: false })
  }

  // Refresh cluster analytics materialized view
  static async refreshClusterAnalytics() {
    return supabaseAdmin.rpc('refresh_cluster_analytics')
  }

  // Delete run and all related data
  static async deleteRun(runId: string) {
    // Due to foreign key constraints with CASCADE, deleting the run will delete all related data
    return Tables.runs().delete().eq('id', runId)
  }

  // Get API key functions (server-side only)
  static async encryptApiKey(apiKey: string) {
    return supabaseAdmin.rpc('encrypt_api_key', { api_key: apiKey })
  }

  static async decryptApiKey(encryptedKey: string) {
    return supabaseAdmin.rpc('decrypt_api_key', { encrypted_key: encryptedKey })
  }

  // Export functions for CSV generation
  static async getEditorialRoadmapForExport(runId: string) {
    const { data, error } = await Tables.roadmapItems()
      .select(`
        *,
        cluster:clusters(label)
      `)
      .eq('run_id', runId)
      .order('due_date', { ascending: true })

    return { data, error }
  }

  static async getKeywordUniverseForExport(runId: string) {
    const { data, error } = await Tables.keywords()
      .select(`
        *,
        cluster:clusters(label)
      `)
      .eq('run_id', runId)
      .order('stage', { ascending: true })
      .order('blended_score', { ascending: false })

    return { data, error }
  }

  // Performance monitoring functions
  static async getRunMetrics(runId: string) {
    const { data: run } = await Tables.runs().select('*').eq('id', runId).single()
    const { data: keywordCounts } = await Tables.keywords()
      .select('stage')
      .eq('run_id', runId)

    const stageCounts = {
      dream100: 0,
      tier2: 0,
      tier3: 0
    }

    keywordCounts?.forEach(k => {
      if (k.stage && k.stage in stageCounts) {
        stageCounts[k.stage as keyof typeof stageCounts]++
      }
    })

    const { data: quickWinCount } = await Tables.keywords()
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('quick_win', true)

    return {
      run,
      stageCounts,
      quickWinCount: quickWinCount || 0
    }
  }
}

// Real-time subscriptions for live updates
export class RealtimeService {
  static subscribeToRun(runId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`run-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'runs',
        filter: `id=eq.${runId}`
      }, callback)
      .subscribe()
  }

  static subscribeToKeywords(runId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`keywords-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'keywords',
        filter: `run_id=eq.${runId}`
      }, callback)
      .subscribe()
  }

  static subscribeToRoadmapItems(runId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`roadmap-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'roadmap_items',
        filter: `run_id=eq.${runId}`
      }, callback)
      .subscribe()
  }
}
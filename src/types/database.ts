// Database Types for Dream 100 Keyword Engine
// Generated TypeScript interfaces for Supabase tables

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enums
export type KeywordStage = 'dream100' | 'tier2' | 'tier3'
export type KeywordIntent = 'transactional' | 'commercial' | 'informational' | 'navigational'
export type RunStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type RoadmapStage = 'pillar' | 'supporting'

// Base interfaces for database tables
export interface Database {
  public: {
    Tables: {
      runs: {
        Row: {
          id: string
          user_id: string
          seed_keywords: string[]
          market: string
          status: RunStatus
          settings: Json
          api_usage: Json
          error_logs: Json
          progress: Json
          created_at: string
          updated_at: string
          started_at: string | null
          completed_at: string | null
          total_keywords: number
          total_clusters: number
        }
        Insert: {
          id?: string
          user_id: string
          seed_keywords: string[]
          market?: string
          status?: RunStatus
          settings?: Json
          api_usage?: Json
          error_logs?: Json
          progress?: Json
          created_at?: string
          updated_at?: string
          started_at?: string | null
          completed_at?: string | null
          total_keywords?: number
          total_clusters?: number
        }
        Update: {
          id?: string
          user_id?: string
          seed_keywords?: string[]
          market?: string
          status?: RunStatus
          settings?: Json
          api_usage?: Json
          error_logs?: Json
          progress?: Json
          created_at?: string
          updated_at?: string
          started_at?: string | null
          completed_at?: string | null
          total_keywords?: number
          total_clusters?: number
        }
      }
      clusters: {
        Row: {
          id: string
          run_id: string
          label: string
          size: number
          score: number
          intent_mix: Json
          representative_keywords: string[]
          similarity_threshold: number
          embedding: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          label: string
          size?: number
          score?: number
          intent_mix?: Json
          representative_keywords?: string[]
          similarity_threshold?: number
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          label?: string
          size?: number
          score?: number
          intent_mix?: Json
          representative_keywords?: string[]
          similarity_threshold?: number
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
      }
      keywords: {
        Row: {
          id: string
          run_id: string
          cluster_id: string | null
          keyword: string
          stage: KeywordStage
          volume: number
          difficulty: number
          intent: KeywordIntent | null
          relevance: number
          trend: number
          blended_score: number
          quick_win: boolean
          canonical_keyword: string | null
          top_serp_urls: string[] | null
          embedding: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          cluster_id?: string | null
          keyword: string
          stage: KeywordStage
          volume?: number
          difficulty?: number
          intent?: KeywordIntent | null
          relevance?: number
          trend?: number
          blended_score?: number
          quick_win?: boolean
          canonical_keyword?: string | null
          top_serp_urls?: string[] | null
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          cluster_id?: string | null
          keyword?: string
          stage?: KeywordStage
          volume?: number
          difficulty?: number
          intent?: KeywordIntent | null
          relevance?: number
          trend?: number
          blended_score?: number
          quick_win?: boolean
          canonical_keyword?: string | null
          top_serp_urls?: string[] | null
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
      }
      competitors: {
        Row: {
          id: string
          run_id: string
          domain: string
          titles: string[] | null
          urls: string[] | null
          discovered_from_keyword: string | null
          scrape_status: string
          scrape_error: string | null
          scraped_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          domain: string
          titles?: string[] | null
          urls?: string[] | null
          discovered_from_keyword?: string | null
          scrape_status?: string
          scrape_error?: string | null
          scraped_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          domain?: string
          titles?: string[] | null
          urls?: string[] | null
          discovered_from_keyword?: string | null
          scrape_status?: string
          scrape_error?: string | null
          scraped_at?: string | null
          created_at?: string
        }
      }
      roadmap_items: {
        Row: {
          id: string
          run_id: string
          cluster_id: string | null
          post_id: string
          stage: RoadmapStage
          primary_keyword: string
          secondary_keywords: string[] | null
          intent: KeywordIntent | null
          volume: number
          difficulty: number
          blended_score: number
          quick_win: boolean
          suggested_title: string | null
          dri: string | null
          due_date: string | null
          notes: string | null
          source_urls: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          cluster_id?: string | null
          post_id: string
          stage: RoadmapStage
          primary_keyword: string
          secondary_keywords?: string[] | null
          intent?: KeywordIntent | null
          volume?: number
          difficulty?: number
          blended_score?: number
          quick_win?: boolean
          suggested_title?: string | null
          dri?: string | null
          due_date?: string | null
          notes?: string | null
          source_urls?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          cluster_id?: string | null
          post_id?: string
          stage?: RoadmapStage
          primary_keyword?: string
          secondary_keywords?: string[] | null
          intent?: KeywordIntent | null
          volume?: number
          difficulty?: number
          blended_score?: number
          quick_win?: boolean
          suggested_title?: string | null
          dri?: string | null
          due_date?: string | null
          notes?: string | null
          source_urls?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          user_id: string
          ahrefs_api_key_encrypted: string | null
          anthropic_api_key_encrypted: string | null
          default_weights: Json
          other_preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ahrefs_api_key_encrypted?: string | null
          anthropic_api_key_encrypted?: string | null
          default_weights?: Json
          other_preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ahrefs_api_key_encrypted?: string | null
          anthropic_api_key_encrypted?: string | null
          default_weights?: Json
          other_preferences?: Json
          created_at?: string
          updated_at?: string
        }
      }
      cluster_analytics: {
        Row: {
          id: string
          run_id: string
          label: string
          size: number
          score: number
          intent_mix: Json
          actual_keyword_count: number | null
          avg_volume: number | null
          avg_difficulty: number | null
          avg_blended_score: number | null
          quick_win_count: number | null
          median_volume: number | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_blended_score: {
        Args: {
          stage: KeywordStage
          volume: number
          difficulty: number
          intent: KeywordIntent
          relevance: number
          trend: number
          weights?: Json
        }
        Returns: number
      }
      is_quick_win: {
        Args: {
          difficulty: number
          volume: number
          cluster_median_volume?: number
        }
        Returns: boolean
      }
      encrypt_api_key: {
        Args: {
          api_key: string
        }
        Returns: string
      }
      decrypt_api_key: {
        Args: {
          encrypted_key: string
        }
        Returns: string
      }
      update_run_progress: {
        Args: {
          run_id: string
          new_status?: RunStatus
          progress_data?: Json
          api_usage_data?: Json
          error_data?: Json
        }
        Returns: void
      }
      bulk_insert_keywords: {
        Args: {
          keywords_data: Json
        }
        Returns: number
      }
      bulk_insert_clusters: {
        Args: {
          clusters_data: Json
        }
        Returns: number
      }
      refresh_cluster_analytics: {
        Args: {}
        Returns: void
      }
    }
    Enums: {
      keyword_stage: KeywordStage
      keyword_intent: KeywordIntent
      run_status: RunStatus
      roadmap_stage: RoadmapStage
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Additional type definitions for application use
import type { ScoringWeights } from '../models/scoring';

export interface RunSettings {
  max_keywords?: number
  max_dream100?: number
  max_tier2_per_dream?: number
  max_tier3_per_tier2?: number
  scoring_weights?: ScoringWeights
  enable_competitor_scraping?: boolean
  similarity_threshold?: number
  quick_win_threshold?: number
  [key: string]: any
}

// Re-export for convenience
export type { ScoringWeights }

export interface ApiUsage {
  ahrefs?: {
    requests: number
    cost: number
    remaining_quota?: number
  }
  anthropic?: {
    requests: number
    tokens: number
    cost: number
  }
  total_cost?: number
  [key: string]: any
}

export interface RunProgress {
  current_stage: string
  stages_completed: string[]
  keywords_discovered: number
  clusters_created: number
  competitors_found: number
  estimated_time_remaining?: number
  percent_complete?: number
  [key: string]: any
}

export interface IntentMix {
  transactional: number
  commercial: number
  informational: number
  navigational: number
}

// Utility types for database operations
export type RunWithKeywords = Database['public']['Tables']['runs']['Row'] & {
  keywords: Database['public']['Tables']['keywords']['Row'][]
}

export type ClusterWithKeywords = Database['public']['Tables']['clusters']['Row'] & {
  keywords: Database['public']['Tables']['keywords']['Row'][]
}

export type KeywordWithCluster = Database['public']['Tables']['keywords']['Row'] & {
  cluster?: Database['public']['Tables']['clusters']['Row']
}

export type RoadmapItemWithCluster = Database['public']['Tables']['roadmap_items']['Row'] & {
  cluster?: Database['public']['Tables']['clusters']['Row']
}

// CSV Export schemas
export interface EditorialRoadmapCSV {
  post_id: string
  cluster_label: string
  stage: RoadmapStage
  primary_keyword: string
  secondary_keywords: string
  intent: KeywordIntent | null
  volume: number
  difficulty: number
  blended_score: number
  quick_win: boolean
  suggested_title: string | null
  dri: string | null
  due_date: string | null
  notes: string | null
  source_urls: string
  run_id: string
}

export interface KeywordUniverseCSV {
  keyword: string
  tier: KeywordStage
  cluster_label: string | null
  volume: number
  difficulty: number
  intent: KeywordIntent | null
  relevance: number
  trend: number
  blended_score: number
  quick_win: boolean
  canonical_keyword: string | null
  top_serp_urls: string
}
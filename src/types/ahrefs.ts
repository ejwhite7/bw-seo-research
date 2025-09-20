// Ahrefs API types
export interface AhrefsKeywordData {
  keyword: string;
  search_volume: number;
  keyword_difficulty: number;
  cpc: number;
  traffic_potential: number;
  return_rate: number;
  clicks: number;
  global_volume: number;
  parent_topic?: {
    keyword: string;
    volume: number;
  };
}

export interface AhrefsSerpFeature {
  type: string;
  count: number;
  positions: number[];
}

export interface AhrefsSerpResult {
  position: number;
  url: string;
  title: string;
  domain: string;
  ahrefs_rank: number;
  traffic: number;
  snippet?: string;
}

export interface AhrefsKeywordOverview extends AhrefsKeywordData {
  serp_features: AhrefsSerpFeature[];
  serp_results: AhrefsSerpResult[];
  last_updated: string;
}

export interface AhrefsKeywordIdeas {
  keywords: AhrefsKeywordData[];
  total_keywords: number;
  pagination: {
    current_page: number;
    total_pages: number;
    has_more: boolean;
  };
}

export interface AhrefsCompetitorKeywords {
  domain: string;
  keywords: Array<{
    keyword: string;
    position: number;
    search_volume: number;
    keyword_difficulty: number;
    cpc: number;
    url: string;
    traffic: number;
  }>;
  total_keywords: number;
}

export interface AhrefsKeywordBatch {
  keywords: string[];
  country?: string;
  mode?: 'prefix' | 'exact' | 'broad';
  limit?: number;
}

export interface AhrefsApiQuota {
  rows_left: number;
  rows_limit: number;
  reset_at: string;
}

// Request types
export interface AhrefsKeywordRequest {
  keywords: string[];
  country?: string;
  mode?: 'exact' | 'phrase' | 'broad';
  include_serp?: boolean;
  include_features?: boolean;
}

export interface AhrefsCompetitorRequest {
  domain: string;
  country?: string;
  limit?: number;
  mode?: 'exact' | 'phrase' | 'broad';
  volume_from?: number;
  volume_to?: number;
  position_from?: number;
  position_to?: number;
}

export interface AhrefsKeywordIdeasRequest {
  target: string; // Changed from seed_keywords to target for compatibility
  country?: string;
  limit?: number;
  volume_from?: number;
  volume_to?: number;
  difficulty_from?: number;
  difficulty_to?: number;
  mode?: 'same_terms' | 'questions' | 'phrase_match' | 'having_same_terms';
}

// Response wrappers
export interface AhrefsResponse<T> {
  data: T;
  quota: AhrefsApiQuota;
  request_id: string;
  processing_time: number;
}

// Metrics types
export type AhrefsMetric = 'volume' | 'difficulty' | 'cpc' | 'traffic_potential' | 'return_rate' | 'clicks' | 'global_volume';
export type AhrefsMetrics = AhrefsMetric[];

// Backward compatibility alias  
export type AhrefsKeywordMetrics = AhrefsKeywordData;

// Enhanced response types with better generic constraints
export interface AhrefsGenericResponse<T = any> extends AhrefsResponse<T> {
  data: T;
  quota: AhrefsApiQuota;
  request_id: string;
  processing_time: number;
}
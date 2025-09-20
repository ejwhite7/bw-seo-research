/**
 * Comprehensive Export Service
 * 
 * Handles CSV, Excel, and JSON exports for all data schemas in the Dream 100 Keyword Engine.
 * Supports streaming for large datasets, progress tracking, and multiple export templates.
 */

import { z } from 'zod';
import { Transform, Readable } from 'stream';
// exceljs will be dynamically imported when needed to avoid test issues
import { 
  ExportConfig,
  ExportResult,
  ExportStatus,
  ExportFormat,
  ExportTemplate,
  ExportFilters,
  ExportOptions,
  EditorialRoadmapCSV,
  KeywordUniverseCSV,
  ClusterAnalysisCSV,
  CompetitorInsightsCSV,
  QuickWinsCSV,
  ExportConfigSchema,
  transformToEditorialRoadmapCSV,
  transformToKeywordUniverseCSV,
  transformToClusterAnalysisCSV,
  generateExportFilename,
  calculateExportSize,
  formatExportValue,
  validateExportData
} from '../models/export';
import type { RoadmapItemWithCluster } from '../models/roadmap';
import type { KeywordWithCluster } from '../models/keyword';
import type { ClusterWithKeywords } from '../models/cluster';
import type { UUID } from '../models/index';
import { ErrorHandler } from '../utils/error-handler';
import * as Sentry from '@sentry/nextjs';

/**
 * Export service configuration
 */
export interface ExportServiceConfig {
  readonly maxConcurrentExports: number;
  readonly maxExportSize: number; // bytes
  readonly maxRecordsPerExport: number;
  readonly streamingThreshold: number; // records
  readonly tempDirectory: string;
  readonly storageProvider: 'local' | 's3' | 'gcs' | 'azure';
  readonly retentionDays: number;
  readonly enableProgressTracking: boolean;
  readonly compressionEnabled: boolean;
}

/**
 * Export progress tracking
 */
export interface ExportProgress {
  readonly exportId: UUID;
  readonly status: ExportStatus;
  readonly progress: number; // 0-100
  readonly currentStage: string;
  readonly recordsProcessed: number;
  readonly totalRecords: number;
  readonly startedAt: string;
  readonly estimatedCompletion?: string;
  readonly error?: string;
}

/**
 * Template-specific export configurations
 */
export interface TemplateConfig {
  readonly writers: {
    readonly includeFields: string[];
    readonly sortBy: string;
    readonly groupBy?: string;
    readonly filters: {
      readonly keywords?: {
        readonly stages?: string[];
        readonly intents?: string[];
        readonly minVolume?: number;
        readonly maxVolume?: number;
        readonly minDifficulty?: number;
        readonly maxDifficulty?: number;
        readonly minScore?: number;
        readonly maxScore?: number;
        readonly quickWinsOnly?: boolean;
        readonly clusters?: string[];
      };
      readonly roadmap?: {
        readonly stages?: string[];
        readonly dris?: string[];
        readonly dueDateFrom?: string;
        readonly dueDateTo?: string;
        readonly includeNotes?: boolean;
      };
      readonly clusters?: {
        readonly minSize?: number;
        readonly maxSize?: number;
        readonly minScore?: number;
        readonly primaryIntents?: string[];
      };
    };
  };
  readonly seoOps: {
    readonly includeFields: string[];
    readonly includeMetrics: boolean;
    readonly includeTechnicalData: boolean;
  };
  readonly stakeholders: {
    readonly includeFields: string[];
    readonly summaryLevel: 'high' | 'detailed';
    readonly includeAnalytics: boolean;
  };
}

/**
 * Comprehensive Export Service
 */
export class ExportService {
  private config: ExportServiceConfig;
  private activeExports: Map<UUID, ExportProgress>;
  private templateConfigs: Map<string, TemplateConfig>;

  constructor(config: ExportServiceConfig) {
    this.config = config;
    this.activeExports = new Map();
    this.templateConfigs = new Map();
    this.initializeTemplateConfigs();
  }

  /**
   * Create a new export with comprehensive validation
   */
  async createExport(exportConfig: ExportConfig): Promise<ExportResult> {
    const startTime = Date.now();
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` as UUID;

    try {
      // Validate export configuration
      const validatedConfig = ExportConfigSchema.parse(exportConfig);
      
      // Initialize progress tracking
      if (this.config.enableProgressTracking) {
        this.activeExports.set(exportId, {
          exportId,
          status: 'queued',
          progress: 0,
          currentStage: 'validation',
          recordsProcessed: 0,
          totalRecords: 0,
          startedAt: new Date().toISOString()
        });
      }

      // Check concurrent exports limit
      const activeCount = Array.from(this.activeExports.values())
        .filter(p => p.status === 'processing').length;
      
      if (activeCount >= this.config.maxConcurrentExports) {
        throw new Error('Maximum concurrent exports limit reached');
      }

      // Fetch and validate data
      this.updateProgress(exportId, 'processing', 10, 'fetching_data');
      const data = await this.fetchExportData(validatedConfig);
      
      if (!data || data.length === 0) {
        throw new Error('No data available for export with current filters');
      }

      // Validate data quality
      const validation = validateExportData(data);
      if (!validation.isValid) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }

      // Check size limits
      const estimatedSize = calculateExportSize(data.length, validatedConfig.format);
      if (estimatedSize > this.config.maxExportSize) {
        throw new Error(`Export size (${estimatedSize} bytes) exceeds limit (${this.config.maxExportSize} bytes)`);
      }

      // Apply filters and transformations
      this.updateProgress(exportId, 'processing', 30, 'applying_filters');
      const filteredData = await this.applyFilters(data, validatedConfig.filters);
      
      this.updateProgress(exportId, 'processing', 50, 'transforming_data');
      const transformedData = await this.transformData(filteredData, validatedConfig);

      // Generate export files
      this.updateProgress(exportId, 'processing', 70, 'generating_files');
      const files = await this.generateExportFiles(exportId, transformedData, validatedConfig);

      // Calculate analytics
      this.updateProgress(exportId, 'processing', 90, 'calculating_analytics');
      const analytics = this.calculateExportAnalytics(transformedData, validatedConfig);

      const completedAt = new Date().toISOString();
      const processingTime = Date.now() - startTime;

      // Create final result
      const result: ExportResult = {
        id: exportId,
        runId: validatedConfig.runId,
        config: validatedConfig,
        status: 'completed',
        startedAt: new Date(startTime).toISOString(),
        completedAt,
        metadata: {
          totalRecords: data.length,
          processedRecords: transformedData.length,
          skippedRecords: data.length - transformedData.length,
          fileSize: files.reduce((sum, f) => sum + f.size, 0),
          processingTime,
          version: '1.0.0',
          generatedBy: 'export-service' as UUID,
          checksum: await this.calculateChecksum(files)
        },
        files,
        error: null,
        analytics
      };

      this.updateProgress(exportId, 'completed', 100, 'complete');
      
      // Clean up progress tracking after delay
      setTimeout(() => this.activeExports.delete(exportId), 300000); // 5 minutes

      // Track success metrics
      Sentry.addBreadcrumb({
        category: 'export',
        message: 'Export completed successfully',
        data: {
          exportId,
          template: validatedConfig.template,
          format: validatedConfig.format,
          recordCount: transformedData.length,
          processingTime,
          fileSize: result.metadata.fileSize
        }
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      
      this.updateProgress(exportId, 'failed', 0, 'error', errorMessage);

      Sentry.captureException(error, {
        tags: { service: 'export' },
        extra: { exportId, config: exportConfig }
      });

      return {
        id: exportId,
        runId: exportConfig.runId,
        config: exportConfig,
        status: 'failed',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        metadata: {
          totalRecords: 0,
          processedRecords: 0,
          skippedRecords: 0,
          fileSize: 0,
          processingTime: Date.now() - startTime,
          version: '1.0.0',
          generatedBy: 'export-service' as UUID,
          checksum: ''
        },
        files: [],
        error: {
          code: 'EXPORT_FAILED',
          message: errorMessage,
          details: { error: String(error) },
          retryable: true,
          suggestion: 'Please check your filters and try again with a smaller dataset'
        },
        analytics: {
          dataQuality: { completeness: 0, accuracy: 0, consistency: 0 },
          distribution: { recordsByType: {}, recordsByStage: {}, recordsByIntent: {} },
          summary: {
            totalKeywords: 0,
            totalClusters: 0,
            totalRoadmapItems: 0,
            quickWinCount: 0,
            avgDifficulty: 0,
            totalVolume: 0
          },
          recommendations: ['Export failed - please review configuration and try again']
        }
      };
    }
  }

  /**
   * Get export progress for tracking
   */
  getExportProgress(exportId: UUID): ExportProgress | null {
    return this.activeExports.get(exportId) || null;
  }

  /**
   * Cancel an active export
   */
  async cancelExport(exportId: UUID): Promise<boolean> {
    const progress = this.activeExports.get(exportId);
    if (!progress || progress.status === 'completed' || progress.status === 'failed') {
      return false;
    }

    this.updateProgress(exportId, 'cancelled', progress.progress, 'cancelled');
    return true;
  }

  /**
   * Create streaming export for large datasets
   */
  async createStreamingExport(exportConfig: ExportConfig): Promise<Readable> {
    const validatedConfig = ExportConfigSchema.parse(exportConfig);
    
    return new Readable({
      objectMode: false,
      async read() {
        try {
          // Implementation would stream data in chunks
          // This is a placeholder for the streaming logic
          this.push('Streaming export not fully implemented in this version\n');
          this.push(null); // End stream
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
  }

  /**
   * Generate export for specific template with predefined settings
   */
  async generateTemplateExport(
    runId: UUID,
    template: 'writers' | 'seo_ops' | 'stakeholders',
    format: ExportFormat = 'csv'
  ): Promise<ExportResult> {
    const templateConfig = this.templateConfigs.get(template);
    if (!templateConfig) {
      throw new Error(`Unknown template: ${template}`);
    }

    // Build export configuration based on template
    const exportConfig: ExportConfig = {
      runId,
      format,
      template: this.mapTemplateToExportTemplate(template),
      filters: this.buildTemplateFilters(template),
      options: this.buildTemplateOptions(template),
      scheduling: null,
      destinations: []
    };

    return this.createExport(exportConfig);
  }

  /**
   * Private: Fetch data based on export configuration
   */
  private async fetchExportData(config: ExportConfig): Promise<any[]> {
    switch (config.template) {
      case 'editorial_roadmap':
        return this.fetchRoadmapData(config.runId);
      
      case 'keyword_universe':
        return this.fetchKeywordData(config.runId);
      
      case 'cluster_analysis':
        return this.fetchClusterData(config.runId);
      
      case 'competitor_insights':
        return this.fetchCompetitorData(config.runId);
      
      case 'quick_wins':
        return this.fetchQuickWinsData(config.runId);
      
      default:
        throw new Error(`Unsupported template: ${config.template}`);
    }
  }

  /**
   * Private: Apply filters to data
   */
  private async applyFilters(data: any[], filters: ExportFilters): Promise<any[]> {
    return data.filter(item => {
      // Keyword filters
      if (filters.keywords) {
        const kf = filters.keywords;
        if (kf.stages && !kf.stages.includes(item.stage)) return false;
        if (kf.intents && item.intent && !kf.intents.includes(item.intent)) return false;
        if (kf.minVolume !== undefined && item.volume < kf.minVolume) return false;
        if (kf.maxVolume !== undefined && item.volume > kf.maxVolume) return false;
        if (kf.minDifficulty !== undefined && item.difficulty < kf.minDifficulty) return false;
        if (kf.maxDifficulty !== undefined && item.difficulty > kf.maxDifficulty) return false;
        if (kf.minScore !== undefined && item.blendedScore < kf.minScore) return false;
        if (kf.maxScore !== undefined && item.blendedScore > kf.maxScore) return false;
        if (kf.quickWinsOnly && !item.quickWin) return false;
        if (kf.clusters && !kf.clusters.includes(item.clusterId)) return false;
      }

      // Roadmap filters
      if (filters.roadmap) {
        const rf = filters.roadmap;
        if (rf.stages && !rf.stages.includes(item.stage)) return false;
        if (rf.dris && item.dri && !rf.dris.includes(item.dri)) return false;
        if (rf.dueDateFrom && item.dueDate && new Date(item.dueDate) < new Date(rf.dueDateFrom)) return false;
        if (rf.dueDateTo && item.dueDate && new Date(item.dueDate) > new Date(rf.dueDateTo)) return false;
      }

      // Cluster filters
      if (filters.clusters) {
        const cf = filters.clusters;
        if (cf.minSize !== undefined && item.size < cf.minSize) return false;
        if (cf.maxSize !== undefined && item.size > cf.maxSize) return false;
        if (cf.minScore !== undefined && item.score < cf.minScore) return false;
        if (cf.primaryIntents && item.primaryIntent && !cf.primaryIntents.includes(item.primaryIntent)) return false;
      }

      return true;
    });
  }

  /**
   * Private: Transform data based on template and options
   */
  private async transformData(data: any[], config: ExportConfig): Promise<any[]> {
    const { template, options } = config;

    // Apply sorting
    let transformedData = [...data];
    if (options.sortBy) {
      transformedData.sort((a, b) => {
        let comparison = 0;
        const sortField = options.sortBy!;
        
        const aVal = a[sortField];
        const bVal = b[sortField];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        }

        return options.sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    // Apply row limit
    if (options.maxRows && transformedData.length > options.maxRows) {
      transformedData = transformedData.slice(0, options.maxRows);
    }

    // Transform based on template
    switch (template) {
      case 'editorial_roadmap':
        return transformToEditorialRoadmapCSV(transformedData as RoadmapItemWithCluster[], options);
      
      case 'keyword_universe':
        return transformToKeywordUniverseCSV(transformedData as KeywordWithCluster[], options);
      
      case 'cluster_analysis':
        return transformToClusterAnalysisCSV(transformedData as ClusterWithKeywords[], options);
      
      case 'quick_wins':
        return this.transformToQuickWinsCSV(transformedData, options);
      
      case 'competitor_insights':
        return this.transformToCompetitorInsightsCSV(transformedData, options);
      
      default:
        return transformedData;
    }
  }

  /**
   * Private: Generate export files
   */
  private async generateExportFiles(
    exportId: UUID, 
    data: any[], 
    config: ExportConfig
  ): Promise<Array<{
    name: string;
    path: string;
    format: ExportFormat;
    size: number;
    records: number;
    downloadUrl: string;
    expiresAt: string;
    checksum: string;
  }>> {
    const files = [];
    const filename = generateExportFilename(config.template, config.runId, config.format);
    const expiresAt = new Date(Date.now() + (this.config.retentionDays * 24 * 60 * 60 * 1000)).toISOString();

    let content: string | Buffer;
    let size: number;

    switch (config.format) {
      case 'csv':
        content = this.generateCSV(data, config.options);
        size = Buffer.byteLength(content, 'utf8');
        break;
      
      case 'excel':
        content = await this.generateExcel(data, config);
        size = content.length;
        break;
      
      case 'json':
        content = JSON.stringify(data, null, 2);
        size = Buffer.byteLength(content, 'utf8');
        break;
      
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }

    // Store file (mock implementation - would integrate with cloud storage)
    const downloadUrl = await this.storeFile(exportId, filename, content);
    const checksum = await this.calculateFileChecksum(content);

    files.push({
      name: filename,
      path: `/exports/${exportId}/${filename}`,
      format: config.format,
      size,
      records: data.length,
      downloadUrl,
      expiresAt,
      checksum
    });

    return files;
  }

  /**
   * Private: Generate CSV content
   */
  private generateCSV(data: any[], options: ExportOptions): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        const formattedValue = formatExportValue(value, 'text', options.formatting);
        
        // Handle CSV escaping
        if (typeof formattedValue === 'string' && 
            (formattedValue.includes(',') || formattedValue.includes('"') || formattedValue.includes('\n'))) {
          return `"${formattedValue.replace(/"/g, '""')}"`;
        }
        
        return formattedValue;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Private: Generate Excel content
   */
  private async generateExcel(data: any[], config: ExportConfig): Promise<Buffer> {
    // Use secure exceljs library instead of vulnerable xlsx
    const ExcelJS = await import('exceljs');
    
    const workbook = new ExcelJS.Workbook();
    const sheetName = config.template.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const worksheet = workbook.addWorksheet(sheetName);

    if (data.length > 0) {
      // Add headers
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);
      
      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };

      // Add data rows
      data.forEach(row => {
        const values = headers.map(header => row[header]);
        worksheet.addRow(values);
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.header) {
          const maxLength = Math.max(
            column.header.toString().length,
            ...data.map(row => (row[column.header as string] || '').toString().length)
          );
          column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        }
      });
    }

    // Generate buffer with proper type casting
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }

  /**
   * Private: Quick wins transformation
   */
  private transformToQuickWinsCSV(data: any[], options: ExportOptions): QuickWinsCSV[] {
    return data
      .filter(item => item.quickWin)
      .map(item => ({
        keyword: item.keyword || item.primaryKeyword,
        volume: item.volume,
        difficulty: item.difficulty,
        ease_score: Math.round((1 - item.difficulty / 100) * 1000) / 1000,
        intent: item.intent,
        cluster_label: item.cluster?.label || null,
        estimated_traffic: Math.round(item.volume * 0.4),
        competition_analysis: this.generateCompetitionAnalysis(item.difficulty),
        content_suggestion: this.generateContentSuggestion(item),
        priority_score: Math.round(item.blendedScore * 100),
        effort_estimate: item.difficulty < 30 ? 'low' : item.difficulty < 60 ? 'medium' : 'high',
        time_to_rank: item.difficulty < 30 ? '1-2 months' : item.difficulty < 60 ? '2-4 months' : '4-6 months',
        recommended_content_type: this.inferContentType(item),
        target_audience: this.inferTargetAudience(item.intent)
      }));
  }

  /**
   * Private: Competitor insights transformation
   */
  private transformToCompetitorInsightsCSV(data: any[], options: ExportOptions): CompetitorInsightsCSV[] {
    // Mock implementation - would integrate with actual competitor data
    return data.map((item, index) => ({
      domain: `competitor${index % 5 + 1}.com` as any,
      discovery_keyword: item.keyword || item.primaryKeyword,
      total_titles: Math.floor(Math.random() * 100) + 10,
      unique_titles: Math.floor(Math.random() * 80) + 5,
      scrape_status: 'completed',
      content_themes: ['guides', 'tutorials', 'reviews'].join(', '),
      avg_title_length: Math.floor(Math.random() * 20) + 40,
      content_frequency: Math.floor(Math.random() * 10) + 5,
      domain_authority: Math.floor(Math.random() * 50) + 30,
      estimated_traffic: Math.floor(Math.random() * 100000) + 10000,
      content_gaps: JSON.stringify(['advanced tutorials', 'case studies']),
      opportunities: JSON.stringify(['better examples', 'more comprehensive coverage']),
      scrape_date: new Date().toISOString().split('T')[0],
      last_updated: new Date().toISOString().split('T')[0]
    }));
  }

  /**
   * Private: Update progress tracking
   */
  private updateProgress(
    exportId: UUID, 
    status: ExportStatus, 
    progress: number, 
    stage: string, 
    error?: string
  ): void {
    if (!this.config.enableProgressTracking) return;

    const existing = this.activeExports.get(exportId);
    if (!existing) return;

    this.activeExports.set(exportId, {
      ...existing,
      status,
      progress,
      currentStage: stage,
      error,
      ...(status === 'completed' && {
        estimatedCompletion: new Date().toISOString()
      })
    });
  }

  /**
   * Private: Calculate export analytics
   */
  private calculateExportAnalytics(data: any[], config: ExportConfig): any {
    const totalRecords = data.length;
    const quickWinCount = data.filter(item => item.quickWin || item.quick_win).length;
    
    return {
      dataQuality: {
        completeness: this.calculateCompleteness(data),
        accuracy: 0.95, // Mock value - would calculate based on validation
        consistency: 0.98 // Mock value - would calculate based on data consistency checks
      },
      distribution: {
        recordsByType: this.getRecordsByType(data),
        recordsByStage: this.getRecordsByStage(data),
        recordsByIntent: this.getRecordsByIntent(data)
      },
      summary: {
        totalKeywords: totalRecords,
        totalClusters: new Set(data.map(item => item.clusterId || item.cluster_id).filter(Boolean)).size,
        totalRoadmapItems: config.template === 'editorial_roadmap' ? totalRecords : 0,
        quickWinCount,
        avgDifficulty: data.reduce((sum, item) => sum + (item.difficulty || 0), 0) / totalRecords,
        totalVolume: data.reduce((sum, item) => sum + (item.volume || 0), 0)
      },
      recommendations: this.generateRecommendations(data, config)
    };
  }

  /**
   * Private: Data fetching methods (mock implementations)
   */
  private async fetchRoadmapData(runId: UUID): Promise<RoadmapItemWithCluster[]> {
    // Mock implementation - would query actual database
    return [];
  }

  private async fetchKeywordData(runId: UUID): Promise<KeywordWithCluster[]> {
    // Mock implementation - would query actual database
    return [];
  }

  private async fetchClusterData(runId: UUID): Promise<ClusterWithKeywords[]> {
    // Mock implementation - would query actual database
    return [];
  }

  private async fetchCompetitorData(runId: UUID): Promise<any[]> {
    // Mock implementation - would query actual database
    return [];
  }

  private async fetchQuickWinsData(runId: UUID): Promise<any[]> {
    // Mock implementation - would query actual database
    return [];
  }

  /**
   * Private: Helper methods
   */
  private async calculateChecksum(files: any[]): Promise<string> {
    // Mock implementation - would calculate actual checksum
    return `checksum-${Date.now()}`;
  }

  private async calculateFileChecksum(content: string | Buffer): Promise<string> {
    // Mock implementation - would use crypto library
    return `file-checksum-${Date.now()}`;
  }

  private async storeFile(exportId: UUID, filename: string, content: string | Buffer): Promise<string> {
    // Mock implementation - would store in cloud storage
    return `/api/exports/${exportId}/download/${filename}`;
  }

  private generateCompetitionAnalysis(difficulty: number): string {
    if (difficulty < 30) return 'Low competition - good opportunity for quick ranking';
    if (difficulty < 60) return 'Medium competition - achievable with quality content';
    return 'High competition - requires comprehensive strategy';
  }

  private generateContentSuggestion(item: any): string {
    const keyword = item.keyword || item.primaryKeyword || '';
    if (keyword.includes('how')) return `Create step-by-step guide for ${keyword}`;
    if (keyword.includes('best')) return `Compile comprehensive list of best ${keyword.replace('best ', '')}`;
    if (keyword.includes('vs')) return `Create detailed comparison for ${keyword}`;
    return `Create informative content targeting ${keyword}`;
  }

  private inferContentType(item: any): string {
    const intent = item.intent;
    const keyword = (item.keyword || item.primaryKeyword || '').toLowerCase();

    if (intent === 'transactional') return 'Landing Page';
    if (intent === 'commercial') {
      if (keyword.includes('vs') || keyword.includes('compare')) return 'Comparison';
      if (keyword.includes('best') || keyword.includes('top')) return 'Listicle';
      return 'Product Guide';
    }
    if (keyword.includes('how')) return 'How-to Guide';
    if (keyword.includes('what') || keyword.includes('definition')) return 'Explainer';
    return 'Blog Post';
  }

  private inferTargetAudience(intent: string | null): string {
    switch (intent) {
      case 'transactional': return 'Ready-to-buy customers';
      case 'commercial': return 'Evaluating prospects';
      case 'informational': return 'Learning-focused users';
      case 'navigational': return 'Specific brand seekers';
      default: return 'General audience';
    }
  }

  private calculateCompleteness(data: any[]): number {
    if (data.length === 0) return 0;

    const totalFields = Object.keys(data[0]).length;
    const completedFields = data.reduce((sum, item) => {
      const nonEmptyFields = Object.values(item).filter(value => 
        value !== null && value !== undefined && value !== ''
      ).length;
      return sum + (nonEmptyFields / totalFields);
    }, 0);

    return Math.round((completedFields / data.length) * 100) / 100;
  }

  private getRecordsByType(data: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    data.forEach(item => {
      const type = item.type || item.stage || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }

  private getRecordsByStage(data: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    data.forEach(item => {
      const stage = item.stage || item.tier || 'unknown';
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return counts;
  }

  private getRecordsByIntent(data: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    data.forEach(item => {
      const intent = item.intent || 'unknown';
      counts[intent] = (counts[intent] || 0) + 1;
    });
    return counts;
  }

  private generateRecommendations(data: any[], config: ExportConfig): string[] {
    const recommendations: string[] = [];
    
    const quickWinRatio = data.filter(item => item.quickWin || item.quick_win).length / data.length;
    if (quickWinRatio > 0.3) {
      recommendations.push('High quick-win potential detected - prioritize these for immediate traffic gains');
    }

    const avgDifficulty = data.reduce((sum, item) => sum + (item.difficulty || 0), 0) / data.length;
    if (avgDifficulty < 40) {
      recommendations.push('Low average difficulty suggests good opportunity for rapid content creation');
    }

    if (data.length > 1000) {
      recommendations.push('Large dataset - consider filtering or creating multiple focused exports');
    }

    return recommendations;
  }

  /**
   * Private: Initialize template configurations
   */
  private initializeTemplateConfigs(): void {
    this.templateConfigs.set('writers', {
      writers: {
        includeFields: ['primary_keyword', 'suggested_title', 'content_type', 'due_date', 'estimated_hours', 'notes', 'priority'],
        sortBy: 'due_date',
        groupBy: 'dri',
        filters: {
          keywords: {},
          roadmap: { includeNotes: true },
          clusters: {}
        }
      },
      seoOps: {
        includeFields: ['keyword', 'volume', 'difficulty', 'blended_score', 'quick_win', 'cluster_label', 'competition_level', 'serp_features'],
        includeMetrics: true,
        includeTechnicalData: true
      },
      stakeholders: {
        includeFields: ['cluster_label', 'primary_keyword', 'volume', 'estimated_traffic', 'priority', 'due_date', 'dri'],
        summaryLevel: 'high',
        includeAnalytics: true
      }
    });

    this.templateConfigs.set('seo_ops', {
      writers: {
        includeFields: ['keyword', 'volume', 'difficulty', 'blended_score', 'quick_win', 'cluster_label', 'competition_level', 'serp_features'],
        sortBy: 'volume',
        filters: {
          keywords: {},
          roadmap: {},
          clusters: {}
        }
      },
      seoOps: {
        includeFields: ['keyword', 'volume', 'difficulty', 'blended_score', 'quick_win', 'cluster_label', 'competition_level', 'serp_features'],
        includeMetrics: true,
        includeTechnicalData: true
      },
      stakeholders: {
        includeFields: ['cluster_label', 'primary_keyword', 'volume', 'estimated_traffic', 'priority', 'due_date', 'dri'],
        summaryLevel: 'detailed',
        includeAnalytics: false
      }
    });

    this.templateConfigs.set('stakeholders', {
      writers: {
        includeFields: ['cluster_label', 'primary_keyword', 'volume', 'estimated_traffic', 'priority', 'due_date', 'dri'],
        sortBy: 'priority',
        filters: {
          keywords: {},
          roadmap: {},
          clusters: {}
        }
      },
      seoOps: {
        includeFields: ['cluster_label', 'primary_keyword', 'volume', 'estimated_traffic', 'priority', 'due_date', 'dri'],
        includeMetrics: false,
        includeTechnicalData: false
      },
      stakeholders: {
        includeFields: ['cluster_label', 'primary_keyword', 'volume', 'estimated_traffic', 'priority', 'due_date', 'dri'],
        summaryLevel: 'high',
        includeAnalytics: true
      }
    });
  }

  private mapTemplateToExportTemplate(template: string): ExportTemplate {
    switch (template) {
      case 'writers': return 'editorial_roadmap';
      case 'seo_ops': return 'keyword_universe';
      case 'stakeholders': return 'cluster_analysis';
      default: return 'editorial_roadmap';
    }
  }

  private buildTemplateFilters(template: string): ExportFilters {
    const templateConfig = this.templateConfigs.get(template);
    return {
      keywords: {
        stages: templateConfig?.writers?.filters?.keywords?.stages as any,
        intents: templateConfig?.writers?.filters?.keywords?.intents as any,
        minVolume: templateConfig?.writers?.filters?.keywords?.minVolume,
        maxVolume: templateConfig?.writers?.filters?.keywords?.maxVolume,
        minDifficulty: templateConfig?.writers?.filters?.keywords?.minDifficulty,
        maxDifficulty: templateConfig?.writers?.filters?.keywords?.maxDifficulty,
        minScore: templateConfig?.writers?.filters?.keywords?.minScore,
        maxScore: templateConfig?.writers?.filters?.keywords?.maxScore,
        quickWinsOnly: templateConfig?.writers?.filters?.keywords?.quickWinsOnly,
        clusters: templateConfig?.writers?.filters?.keywords?.clusters
      },
      roadmap: {
        stages: templateConfig?.writers?.filters?.roadmap?.stages as any,
        dris: templateConfig?.writers?.filters?.roadmap?.dris,
        dueDateFrom: templateConfig?.writers?.filters?.roadmap?.dueDateFrom,
        dueDateTo: templateConfig?.writers?.filters?.roadmap?.dueDateTo,
        includeNotes: templateConfig?.writers?.filters?.roadmap?.includeNotes
      },
      clusters: {
        minSize: templateConfig?.writers?.filters?.clusters?.minSize,
        maxSize: templateConfig?.writers?.filters?.clusters?.maxSize,
        minScore: templateConfig?.writers?.filters?.clusters?.minScore,
        primaryIntents: templateConfig?.writers?.filters?.clusters?.primaryIntents as any
      }
    };
  }

  private buildTemplateOptions(template: string): ExportOptions {
    const templateConfig = this.templateConfigs.get(template);
    
    return {
      includeMetadata: true,
      includeAnalytics: templateConfig?.stakeholders?.includeAnalytics || false,
      groupBy: templateConfig?.writers?.groupBy as 'cluster' | 'intent' | 'stage' | 'dri' | 'month' | undefined,
      sortBy: (templateConfig?.writers?.sortBy as 'volume' | 'difficulty' | 'score' | 'date' | 'alphabetical') || 'score',
      sortDirection: 'desc',
      maxRows: undefined,
      customFields: [],
      formatting: {
        dateFormat: 'US',
        numberFormat: 'US',
        currencySymbol: '$',
        booleanFormat: 'true_false'
      }
    };
  }
}

/**
 * Default export service configuration
 */
export const defaultExportConfig: ExportServiceConfig = {
  maxConcurrentExports: 5,
  maxExportSize: 50 * 1024 * 1024, // 50MB
  maxRecordsPerExport: 100000,
  streamingThreshold: 10000,
  tempDirectory: '/tmp/exports',
  storageProvider: 'local',
  retentionDays: 7,
  enableProgressTracking: true,
  compressionEnabled: true
};

/**
 * Export service singleton
 */
export const exportService = new ExportService(defaultExportConfig);
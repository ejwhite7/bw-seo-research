/**
 * Validation Data Models
 * 
 * Comprehensive validation schemas, error handling,
 * and data quality assurance for all model types.
 */

import { z } from 'zod';
import type { UUID, JSONValue } from './index';

/**
 * Validation result structure
 */
export interface ValidationResult<T = unknown> {
  readonly success: boolean;
  readonly data: T | null;
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
  readonly metadata: ValidationMetadata;
}

/**
 * Validation error details
 */
export interface ValidationError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly value: unknown;
  readonly constraint: string | null;
  readonly severity: 'error' | 'critical';
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly value: unknown;
  readonly recommendation: string;
  readonly severity: 'info' | 'warning';
}

/**
 * Validation metadata
 */
export interface ValidationMetadata {
  readonly validatedAt: string;
  readonly validatorVersion: string;
  readonly schema: string;
  readonly totalFields: number;
  readonly validFields: number;
  readonly invalidFields: number;
  readonly processingTime: number; // milliseconds
}

/**
 * Batch validation configuration
 */
export interface BatchValidationConfig {
  readonly schema: string;
  readonly strictMode: boolean;
  readonly stopOnFirstError: boolean;
  readonly maxErrors: number;
  readonly validateReferences: boolean;
  readonly customValidators: CustomValidator[];
  readonly transformations: DataTransformation[];
}

/**
 * Custom validator function
 */
export interface CustomValidator {
  readonly name: string;
  readonly description: string;
  readonly fields: string[];
  readonly validator: (value: unknown, context: ValidationContext) => ValidationResult<unknown>;
  readonly priority: number;
}

/**
 * Data transformation configuration
 */
export interface DataTransformation {
  readonly name: string;
  readonly field: string;
  readonly type: 'normalize' | 'format' | 'convert' | 'sanitize';
  readonly transformer: (value: unknown) => unknown;
  readonly applyBefore: boolean; // apply before or after validation
}

/**
 * Validation context for custom validators
 */
export interface ValidationContext {
  readonly item: Record<string, unknown>;
  readonly allItems: Record<string, unknown>[];
  readonly index: number;
  readonly references: Record<string, unknown[]>; // related data for reference validation
}

/**
 * Data quality assessment
 */
export interface DataQualityAssessment {
  readonly overall: {
    readonly score: number; // 0-100
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly recommendation: string;
  };
  readonly dimensions: {
    readonly completeness: QualityDimension;
    readonly accuracy: QualityDimension;
    readonly consistency: QualityDimension;
    readonly validity: QualityDimension;
    readonly uniqueness: QualityDimension;
    readonly timeliness: QualityDimension;
  };
  readonly issues: DataQualityIssue[];
  readonly suggestions: DataQualitySuggestion[];
}

/**
 * Quality dimension assessment
 */
export interface QualityDimension {
  readonly score: number; // 0-100
  readonly description: string;
  readonly issues: number;
  readonly impact: 'low' | 'medium' | 'high';
  readonly recommendations: string[];
}

/**
 * Data quality issue
 */
export interface DataQualityIssue {
  readonly type: 'missing_value' | 'invalid_format' | 'duplicate' | 'inconsistency' | 'outlier' | 'stale_data';
  readonly field: string;
  readonly description: string;
  readonly affected: number; // number of records affected
  readonly examples: unknown[];
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly autoFixable: boolean;
}

/**
 * Data quality improvement suggestion
 */
export interface DataQualitySuggestion {
  readonly type: 'data_enrichment' | 'validation_rule' | 'transformation' | 'monitoring';
  readonly title: string;
  readonly description: string;
  readonly impact: number; // 1-10
  readonly effort: number; // 1-10
  readonly priority: 'low' | 'medium' | 'high';
  readonly implementation: string;
}

/**
 * Schema validation configuration
 */
export interface SchemaValidationConfig {
  readonly allowUnknownFields: boolean;
  readonly stripUnknownFields: boolean;
  readonly coerceTypes: boolean;
  readonly validateAsync: boolean;
  readonly cacheSchemas: boolean;
  readonly customFormats: Record<string, (value: string) => boolean>;
  readonly customKeywords: Record<string, (value: unknown) => boolean>;
}

/**
 * Field-level validation rules
 */
export interface FieldValidationRule {
  readonly field: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'uuid';
  readonly required: boolean;
  readonly nullable: boolean;
  readonly constraints: FieldConstraints;
  readonly dependencies: string[]; // fields this field depends on
  readonly conditionalRules: ConditionalRule[];
}

/**
 * Field constraints
 */
export interface FieldConstraints {
  // String constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: 'email' | 'url' | 'date' | 'uuid' | 'slug' | 'json';
  readonly enum?: string[];
  
  // Number constraints
  readonly min?: number;
  readonly max?: number;
  readonly multipleOf?: number;
  readonly precision?: number;
  
  // Array constraints
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  
  // Custom constraints
  readonly custom?: CustomConstraint[];
}

/**
 * Custom constraint definition
 */
export interface CustomConstraint {
  readonly name: string;
  readonly validator: (value: unknown) => boolean;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

/**
 * Conditional validation rule
 */
export interface ConditionalRule {
  readonly condition: string; // JSONPath expression
  readonly then: Partial<FieldValidationRule>;
  readonly else?: Partial<FieldValidationRule>;
}

/**
 * Reference validation configuration
 */
export interface ReferenceValidation {
  readonly field: string;
  readonly referenceTable: string;
  readonly referenceField: string;
  readonly allowNull: boolean;
  readonly cascade: boolean; // validate referenced object
}

/**
 * Comprehensive validation schemas for all models
 */
export const ValidationSchemas = {
  // Common validations
  UUID: z.string().uuid(),
  Email: z.string().email(),
  URL: z.string().url(),
  Date: z.string().datetime(),
  Slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  
  // Keyword validation
  KeywordString: z.string()
    .min(1, "Keyword cannot be empty")
    .max(255, "Keyword too long")
    .regex(/^[a-zA-Z0-9\s\-_'".,!?()]+$/, "Invalid characters in keyword")
    .transform(val => val.trim().toLowerCase()),
  
  KeywordVolume: z.number()
    .int("Volume must be an integer")
    .min(0, "Volume cannot be negative")
    .max(10000000, "Volume too high")
    .refine(val => !isNaN(val), "Volume must be a valid number"),
  
  KeywordDifficulty: z.number()
    .int("Difficulty must be an integer")
    .min(0, "Difficulty cannot be negative")
    .max(100, "Difficulty cannot exceed 100")
    .refine(val => val >= 0 && val <= 100, "Difficulty must be 0-100"),
  
  KeywordScore: z.number()
    .min(0, "Score cannot be negative")
    .max(1, "Score cannot exceed 1")
    .refine(val => !isNaN(val) && isFinite(val), "Score must be finite"),
  
  // Domain validation
  Domain: z.string()
    .min(4, "Domain too short")
    .max(253, "Domain too long")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/, "Invalid domain format")
    .transform(val => val.toLowerCase()),
  
  // Scoring weights validation
  ScoringWeight: z.number()
    .min(0, "Weight cannot be negative")
    .max(1, "Weight cannot exceed 1")
    .refine(val => !isNaN(val) && isFinite(val), "Weight must be finite"),
  
  // Intent validation
  Intent: z.enum(['transactional', 'commercial', 'informational', 'navigational'])
    .refine(val => val !== null && val !== undefined, "Intent is required"),
  
  // Stage validation
  KeywordStage: z.enum(['dream100', 'tier2', 'tier3'])
    .refine(val => val !== null && val !== undefined, "Stage is required"),
  
  RoadmapStage: z.enum(['pillar', 'supporting'])
    .refine(val => val !== null && val !== undefined, "Stage is required")
} as const;

/**
 * Validation rule sets for different contexts
 */
export const ValidationRules = {
  // Strict validation for production
  PRODUCTION: {
    allowUnknownFields: false,
    stripUnknownFields: true,
    coerceTypes: false,
    requireAllFields: true,
    validateReferences: true,
    strictMode: true
  },
  
  // Lenient validation for development/testing
  DEVELOPMENT: {
    allowUnknownFields: true,
    stripUnknownFields: false,
    coerceTypes: true,
    requireAllFields: false,
    validateReferences: false,
    strictMode: false
  },
  
  // Import validation (more lenient, with transformations)
  IMPORT: {
    allowUnknownFields: true,
    stripUnknownFields: true,
    coerceTypes: true,
    requireAllFields: false,
    validateReferences: false,
    applyTransformations: true
  }
} as const;

/**
 * Pre-built custom validators
 */
export const CustomValidators = {
  // Keyword validation
  uniqueKeywords: {
    name: 'uniqueKeywords',
    description: 'Ensure keywords are unique within a run',
    fields: ['keyword'],
    validator: (value: unknown, context: ValidationContext): ValidationResult<unknown> => {
      const keyword = String(value).toLowerCase();
      const duplicates = context.allItems.filter(
        (item, index) => index !== context.index && 
        String(item.keyword).toLowerCase() === keyword
      );
      
      return {
        success: duplicates.length === 0,
        data: value,
        errors: duplicates.length > 0 ? [{
          field: 'keyword',
          code: 'DUPLICATE_KEYWORD',
          message: `Keyword "${keyword}" already exists in this run`,
          value,
          constraint: 'unique',
          severity: 'error' as const
        }] : [],
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '1.0.0',
          schema: 'uniqueKeywords',
          totalFields: 1,
          validFields: duplicates.length === 0 ? 1 : 0,
          invalidFields: duplicates.length > 0 ? 1 : 0,
          processingTime: 1
        }
      };
    },
    priority: 1
  },
  
  // Scoring validation
  scoringWeightsSum: {
    name: 'scoringWeightsSum',
    description: 'Ensure scoring weights sum to 1.0',
    fields: ['volume', 'intent', 'relevance', 'trend', 'ease'],
    validator: (value: unknown, context: ValidationContext): ValidationResult<unknown> => {
      const item = context.item as Record<string, number>;
      const sum = ['volume', 'intent', 'relevance', 'trend', 'ease']
        .reduce((total, field) => total + (item[field] || 0), 0);
      
      const isValid = Math.abs(sum - 1) < 0.01;
      
      return {
        success: isValid,
        data: value,
        errors: !isValid ? [{
          field: 'weights',
          code: 'INVALID_WEIGHT_SUM',
          message: `Scoring weights sum to ${sum.toFixed(3)}, must sum to 1.0`,
          value: sum,
          constraint: 'sum=1.0',
          severity: 'error' as const
        }] : [],
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '1.0.0',
          schema: 'scoringWeightsSum',
          totalFields: 5,
          validFields: isValid ? 5 : 0,
          invalidFields: !isValid ? 5 : 0,
          processingTime: 1
        }
      };
    },
    priority: 2
  },
  
  // Cluster validation
  clusterSize: {
    name: 'clusterSize',
    description: 'Validate cluster has reasonable size',
    fields: ['size'],
    validator: (value: unknown, context: ValidationContext): ValidationResult<unknown> => {
      const size = Number(value);
      const warnings: ValidationWarning[] = [];
      
      if (size < 3) {
        warnings.push({
          field: 'size',
          code: 'SMALL_CLUSTER',
          message: 'Cluster is very small and might be merged',
          value,
          recommendation: 'Consider merging with similar clusters',
          severity: 'warning'
        });
      }
      
      if (size > 100) {
        warnings.push({
          field: 'size',
          code: 'LARGE_CLUSTER',
          message: 'Cluster is very large and might be split',
          value,
          recommendation: 'Consider splitting into sub-clusters',
          severity: 'warning'
        });
      }
      
      return {
        success: true,
        data: value,
        errors: [],
        warnings,
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '1.0.0',
          schema: 'clusterSize',
          totalFields: 1,
          validFields: 1,
          invalidFields: 0,
          processingTime: 1
        }
      };
    },
    priority: 3
  }
} as const;

/**
 * Data transformations
 */
export const DataTransformations = {
  // Normalize keyword strings
  normalizeKeyword: {
    name: 'normalizeKeyword',
    field: 'keyword',
    type: 'normalize' as const,
    transformer: (value: unknown): string => {
      return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-zA-Z0-9\s\-_'".,!?()]/g, '');
    },
    applyBefore: true
  },
  
  // Normalize domain strings
  normalizeDomain: {
    name: 'normalizeDomain',
    field: 'domain',
    type: 'normalize' as const,
    transformer: (value: unknown): string => {
      return String(value)
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/$/, '')
        .split('/')[0];
    },
    applyBefore: true
  },
  
  // Format scores to 2 decimal places
  formatScore: {
    name: 'formatScore',
    field: 'score',
    type: 'format' as const,
    transformer: (value: unknown): number => {
      const num = Number(value);
      return Math.round(num * 100) / 100;
    },
    applyBefore: false
  },
  
  // Sanitize text fields
  sanitizeText: {
    name: 'sanitizeText',
    field: 'text',
    type: 'sanitize' as const,
    transformer: (value: unknown): string => {
      return String(value)
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .trim();
    },
    applyBefore: true
  }
} as const;

/**
 * Validation utility functions
 */
export const validateModel = <T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  config: Partial<SchemaValidationConfig> = {}
): ValidationResult<T> => {
  const startTime = Date.now();
  
  try {
    const result = schema.safeParse(data);
    const processingTime = Date.now() - startTime;
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
        errors: [],
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '1.0.0',
          schema: schema.description || 'unknown',
          totalFields: getFieldCount(data),
          validFields: getFieldCount(data),
          invalidFields: 0,
          processingTime
        }
      };
    } else {
      const errors: ValidationError[] = result.error.issues.map(err => ({
        field: err.path.join('.'),
        code: err.code,
        message: err.message,
        value: getValueAtPath(data, err.path),
        constraint: getConstraintFromError(err),
        severity: 'error' as const
      }));
      
      return {
        success: false,
        data: null,
        errors,
        warnings: [],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: '1.0.0',
          schema: schema.description || 'unknown',
          totalFields: getFieldCount(data),
          validFields: 0,
          invalidFields: errors.length,
          processingTime
        }
      };
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: [{
        field: 'root',
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown validation error',
        value: data,
        constraint: null,
        severity: 'critical'
      }],
      warnings: [],
      metadata: {
        validatedAt: new Date().toISOString(),
        validatorVersion: '1.0.0',
        schema: 'error',
        totalFields: 0,
        validFields: 0,
        invalidFields: 1,
        processingTime: Date.now() - startTime
      }
    };
  }
};

export const batchValidate = <T>(
  items: unknown[],
  schema: z.ZodSchema<T>,
  config: BatchValidationConfig
): ValidationResult<T[]> => {
  const startTime = Date.now();
  const results: T[] = [];
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Apply pre-validation transformations
    let transformedItem = item;
    if (config.transformations) {
      transformedItem = applyTransformations(item, config.transformations.filter(t => t.applyBefore));
    }
    
    // Validate with schema
    const result = validateModel(transformedItem, schema);
    
    if (result.success && result.data) {
      // Apply post-validation transformations
      let finalItem = result.data;
      if (config.transformations) {
        finalItem = applyTransformations(result.data, config.transformations.filter(t => !t.applyBefore)) as NonNullable<T>;
      }
      
      // Run custom validators
      if (config.customValidators) {
        const context: ValidationContext = {
          item: finalItem as Record<string, unknown>,
          allItems: items as Record<string, unknown>[],
          index: i,
          references: {} // Would be populated with reference data
        };
        
        for (const validator of config.customValidators.sort((a, b) => a.priority - b.priority)) {
          const customResult = validator.validator(finalItem, context);
          errors.push(...customResult.errors);
          warnings.push(...customResult.warnings);
        }
      }
      
      results.push(finalItem);
    } else {
      errors.push(...result.errors.map(err => ({ ...err, field: `[${i}].${err.field}` })));
      
      if (config.stopOnFirstError) break;
      if (config.maxErrors && errors.length >= config.maxErrors) break;
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  return {
    success: errors.length === 0,
    data: results,
    errors,
    warnings,
    metadata: {
      validatedAt: new Date().toISOString(),
      validatorVersion: '1.0.0',
      schema: config.schema,
      totalFields: items.length,
      validFields: results.length,
      invalidFields: items.length - results.length,
      processingTime
    }
  };
};

export const assessDataQuality = (data: unknown[]): DataQualityAssessment => {
  // Implementation would analyze data for quality dimensions
  // This is a simplified example
  
  const completeness = assessCompleteness(data);
  const accuracy = assessAccuracy(data);
  const consistency = assessConsistency(data);
  const validity = assessValidity(data);
  const uniqueness = assessUniqueness(data);
  const timeliness = assessTimeliness(data);
  
  const overallScore = Math.round(
    (completeness.score + accuracy.score + consistency.score + 
     validity.score + uniqueness.score + timeliness.score) / 6
  );
  
  const grade = overallScore >= 90 ? 'A' :
                overallScore >= 80 ? 'B' :
                overallScore >= 70 ? 'C' :
                overallScore >= 60 ? 'D' : 'F';
  
  return {
    overall: {
      score: overallScore,
      grade,
      recommendation: getOverallRecommendation(overallScore)
    },
    dimensions: {
      completeness,
      accuracy,
      consistency,
      validity,
      uniqueness,
      timeliness
    },
    issues: [], // Would be populated with detected issues
    suggestions: [] // Would be populated with improvement suggestions
  };
};

/**
 * Helper functions
 */
const getFieldCount = (data: unknown): number => {
  if (typeof data === 'object' && data !== null) {
    return Object.keys(data as Record<string, unknown>).length;
  }
  return 0;
};

const getValueAtPath = (data: unknown, path: (string | number)[]): unknown => {
  let current = data;
  for (const segment of path) {
    if (current && typeof current === 'object') {
      current = (current as any)[segment];
    } else {
      return undefined;
    }
  }
  return current;
};

const getConstraintFromError = (err: z.ZodIssue): string | null => {
  // Use a more compatible approach with Zod types
  const errAny = err as any;
  
  switch (err.code) {
    case 'too_small': 
      return errAny.minimum !== undefined ? `min: ${errAny.minimum}` : null;
    case 'too_big': 
      return errAny.maximum !== undefined ? `max: ${errAny.maximum}` : null;
    default: 
      return null;
  }
};

const applyTransformations = (data: unknown, transformations: DataTransformation[]): unknown => {
  const result = data;
  
  for (const transformation of transformations) {
    if (typeof result === 'object' && result !== null && transformation.field in result) {
      (result as any)[transformation.field] = transformation.transformer((result as any)[transformation.field]);
    }
  }
  
  return result;
};

// Quality dimension assessment functions (simplified implementations)
const assessCompleteness = (data: unknown[]): QualityDimension => ({
  score: 95, // Would calculate actual completeness
  description: 'Percentage of non-null values',
  issues: 2,
  impact: 'low',
  recommendations: ['Fill missing required fields']
});

const assessAccuracy = (data: unknown[]): QualityDimension => ({
  score: 88,
  description: 'Correctness of data values',
  issues: 5,
  impact: 'medium',
  recommendations: ['Validate data sources', 'Implement data verification']
});

const assessConsistency = (data: unknown[]): QualityDimension => ({
  score: 92,
  description: 'Uniformity of data formats and values',
  issues: 3,
  impact: 'low',
  recommendations: ['Standardize formats', 'Implement validation rules']
});

const assessValidity = (data: unknown[]): QualityDimension => ({
  score: 85,
  description: 'Conformance to defined business rules',
  issues: 7,
  impact: 'medium',
  recommendations: ['Review validation rules', 'Fix invalid data']
});

const assessUniqueness = (data: unknown[]): QualityDimension => ({
  score: 98,
  description: 'Absence of duplicate records',
  issues: 1,
  impact: 'low',
  recommendations: ['Remove duplicates']
});

const assessTimeliness = (data: unknown[]): QualityDimension => ({
  score: 90,
  description: 'Recency and availability when needed',
  issues: 4,
  impact: 'medium',
  recommendations: ['Update stale data', 'Improve refresh frequency']
});

const getOverallRecommendation = (score: number): string => {
  if (score >= 90) return 'Excellent data quality. Continue current practices.';
  if (score >= 80) return 'Good data quality. Minor improvements needed.';
  if (score >= 70) return 'Fair data quality. Several areas need attention.';
  if (score >= 60) return 'Poor data quality. Significant improvements required.';
  return 'Critical data quality issues. Immediate action required.';
};

/**
 * Exported validation utility functions
 */
export const formatValidationError = (error: ValidationError): string => {
  return `${error.field}: ${error.message} (${error.code})`;
};

export const formatValidationWarning = (warning: ValidationWarning): string => {
  return `${warning.field}: ${warning.message} - ${warning.recommendation}`;
};

export const getValidationSummary = (result: ValidationResult): string => {
  const { success, errors, warnings } = result;
  if (success && errors.length === 0 && warnings.length === 0) {
    return 'Validation passed successfully';
  }
  
  const parts: string[] = [];
  if (errors.length > 0) {
    parts.push(`${errors.length} error${errors.length > 1 ? 's' : ''}`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
  }
  
  return `Validation completed with ${parts.join(' and ')}`;
};

// Note: Duplicate function declarations removed - using the ones defined earlier in the file
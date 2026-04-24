/**
 * Decomposition Validator
 *
 * Validates that decomposed intents can reconstruct the original query.
 * Ensures no information is lost during intent decomposition.
 */

import { logger } from '../core/logger';

// ==================== Type Definitions ====================

export interface AtomicIntent {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  coverageScore: number;
  issues: ValidationIssue[];
  reconstructedQuery: string;
}

export interface ValidationIssue {
  type: 'info_loss' | 'ambiguity' | 'overlap' | 'missing_dependency' | 'ordering';
  severity: 'error' | 'warning' | 'info';
  message: string;
  relatedIntents: string[];
}

// ==================== Main Validator Class ====================

export class DecompositionValidator {
  /**
   * Validate that decomposed intents can reconstruct the original query
   */
  static validate(
    originalQuery: string,
    intents: AtomicIntent[],
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!intents || intents.length === 0) {
      return {
        valid: false,
        coverageScore: 0,
        issues: [{
          type: 'info_loss',
          severity: 'error',
          message: 'No intents were extracted from the query',
          relatedIntents: [],
        }],
        reconstructedQuery: '',
      };
    }

    // Check 1: Information coverage
    const coverageResult = DecompositionValidator.checkInformationCoverage(originalQuery, intents);
    issues.push(...coverageResult.issues);

    // Check 2: Intent overlap
    const overlapResult = DecompositionValidator.checkIntentOverlap(intents);
    issues.push(...overlapResult.issues);

    // Check 3: Dependency ordering
    const dependencyResult = DecompositionValidator.checkDependencyOrdering(intents);
    issues.push(...dependencyResult.issues);

    // Check 4: Parameter completeness
    const paramResult = DecompositionValidator.checkParameterCompleteness(intents);
    issues.push(...paramResult.issues);

    // Reconstruct query from intents
    const reconstructedQuery = DecompositionValidator.reconstructQuery(intents);

    // Calculate coverage score
    const coverageScore = DecompositionValidator.calculateCoverageScore(
      originalQuery,
      reconstructedQuery,
      issues,
    );

    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      valid: !hasErrors,
      coverageScore,
      issues,
      reconstructedQuery,
    };
  }

  /**
   * Check if all key information from the original query is covered
   */
  private static checkInformationCoverage(
    originalQuery: string,
    intents: AtomicIntent[],
  ): { issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    const queryLower = originalQuery.toLowerCase();

    // Extract key terms from original query (words with length > 3)
    const keyTerms = queryLower
      .split(/\W+/)
      .filter(t => t.length > 3)
      .filter(t => !DecompositionValidator.isStopWord(t));

    // Collect all terms from intents
    const intentTerms = new Set<string>();
    for (const intent of intents) {
      const desc = intent.description.toLowerCase();
      desc.split(/\W+/).forEach(t => {
        if (t.length > 2) intentTerms.add(t);
      });

      // Add parameter values
      for (const value of Object.values(intent.parameters)) {
        if (typeof value === 'string') {
          value.split(/\W+/).forEach(t => {
            if (t.length > 2) intentTerms.add(t.toLowerCase());
          });
        }
      }
    }

    // Find missing terms
    const missingTerms = keyTerms.filter(t => !intentTerms.has(t));

    if (missingTerms.length > 0) {
      const coverage = 1 - (missingTerms.length / keyTerms.length);
      const severity = coverage < 0.5 ? 'error' : 'warning';

      issues.push({
        type: 'info_loss',
        severity,
        message: `Information loss detected. Missing terms: "${missingTerms.join(', ')}"`,
        relatedIntents: intents.map(i => i.id),
      });
    }

    return { issues };
  }

  /**
   * Check for overlapping or redundant intents
   */
  private static checkIntentOverlap(
    intents: AtomicIntent[],
  ): { issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < intents.length; i++) {
      for (let j = i + 1; j < intents.length; j++) {
        const a = intents[i];
        const b = intents[j];

        // Check if intents have similar descriptions
        const descA = a.description.toLowerCase();
        const descB = b.description.toLowerCase();

        const wordsA = new Set(descA.split(/\W+/).filter(w => w.length > 3));
        const wordsB = new Set(descB.split(/\W+/).filter(w => w.length > 3));

        let overlap = 0;
        for (const word of wordsA) {
          if (wordsB.has(word)) overlap++;
        }

        const maxSize = Math.max(wordsA.size, wordsB.size);
        const overlapRatio = maxSize > 0 ? overlap / maxSize : 0;

        if (overlapRatio > 0.7) {
          issues.push({
            type: 'overlap',
            severity: 'warning',
            message: `Intents "${a.id}" and "${b.id}" have significant overlap (${Math.round(overlapRatio * 100)}% similar)`,
            relatedIntents: [a.id, b.id],
          });
        }

        // Check if intents have the same type
        if (a.type === b.type) {
          const paramOverlap = Object.keys(a.parameters).filter(
            k => k in b.parameters,
          ).length;

          if (paramOverlap > 0) {
            issues.push({
              type: 'overlap',
              severity: 'info',
              message: `Intents "${a.id}" and "${b.id}" share ${paramOverlap} parameter(s)`,
              relatedIntents: [a.id, b.id],
            });
          }
        }
      }
    }

    return { issues };
  }

  /**
   * Check if intents are in correct dependency order
   */
  private static checkDependencyOrdering(
    intents: AtomicIntent[],
  ): { issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    // Common dependency patterns: create before use, start before stop, etc.
    const dependencyPairs: Array<[string, string]> = [
      ['create', 'update'],
      ['create', 'delete'],
      ['create', 'read'],
      ['start', 'stop'],
      ['open', 'close'],
      ['connect', 'disconnect'],
      ['upload', 'download'],
      ['lock', 'unlock'],
    ];

    for (let i = 0; i < intents.length; i++) {
      for (let j = i + 1; j < intents.length; j++) {
        const earlier = intents[i].type.toLowerCase();
        const later = intents[j].type.toLowerCase();

        for (const [shouldBeFirst, shouldBeSecond] of dependencyPairs) {
          if (later === shouldBeFirst && earlier === shouldBeSecond) {
            issues.push({
              type: 'ordering',
              severity: 'warning',
              message: `Intent "${intents[j].id}" (${intents[j].type}) should come before "${intents[i].id}" (${intents[i].type})`,
              relatedIntents: [intents[i].id, intents[j].id],
            });
          }
        }
      }
    }

    return { issues };
  }

  /**
   * Check parameter completeness across intents
   */
  private static checkParameterCompleteness(
    intents: AtomicIntent[],
  ): { issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    for (const intent of intents) {
      const params = intent.parameters || {};
      const paramCount = Object.keys(params).length;

      if (paramCount === 0) {
        issues.push({
          type: 'info_loss',
          severity: 'warning',
          message: `Intent "${intent.id}" (${intent.type}) has no parameters extracted`,
          relatedIntents: [intent.id],
        });
      }

      // Check for null/empty parameter values
      const emptyParams = Object.entries(params)
        .filter(([_, v]) => v === null || v === undefined || v === '')
        .map(([k]) => k);

      if (emptyParams.length > 0) {
        issues.push({
          type: 'info_loss',
          severity: 'info',
          message: `Intent "${intent.id}" has empty parameters: ${emptyParams.join(', ')}`,
          relatedIntents: [intent.id],
        });
      }
    }

    return { issues };
  }

  /**
   * Reconstruct query from intents
   */
  static reconstructQuery(intents: AtomicIntent[]): string {
    const parts: string[] = [];

    for (const intent of intents) {
      parts.push(intent.description);

      // Add parameter context
      const paramValues = Object.entries(intent.parameters || {})
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${v}`);

      if (paramValues.length > 0) {
        parts.push(`(${paramValues.join(', ')})`);
      }
    }

    return parts.join('; ');
  }

  /**
   * Calculate coverage score
   */
  private static calculateCoverageScore(
    originalQuery: string,
    reconstructedQuery: string,
    issues: ValidationIssue[],
  ): number {
    // Base score
    let score = 1.0;

    // Deduct for errors
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    score -= errors.length * 0.2;
    score -= warnings.length * 0.1;

    // Compare query lengths as rough coverage metric
    const originalLen = originalQuery.length;
    const reconstructedLen = reconstructedQuery.length;

    if (originalLen > 0) {
      const lengthRatio = Math.min(1, reconstructedLen / originalLen);
      score *= (0.5 + 0.5 * lengthRatio);
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if a word is a stop word
   */
  private static isStopWord(word: string): boolean {
    const stopWords = new Set([
      'this', 'that', 'these', 'those', 'what', 'which', 'where', 'when',
      'how', 'who', 'whom', 'whose', 'why', 'the', 'and', 'for', 'are',
      'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one',
      'our', 'out', 'has', 'have', 'been', 'some', 'them', 'than',
      'then', 'they', 'very', 'just', 'with', 'without', 'about',
      'into', 'over', 'after', 'before', 'between', 'under', 'above',
      'from', 'your', 'will', 'would', 'should', 'could', 'shall',
      'might', 'must', 'need', 'dare', 'ought', 'used', 'also',
    ]);

    return stopWords.has(word);
  }

  /**
   * Get a summary of validation results
   */
  static getSummary(result: ValidationResult): string {
    const lines: string[] = [
      `Validation: ${result.valid ? 'PASSED' : 'FAILED'}`,
      `Coverage Score: ${Math.round(result.coverageScore * 100)}%`,
      `Issues Found: ${result.issues.length}`,
    ];

    if (result.issues.length > 0) {
      lines.push('\nIssues:');
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        lines.push(`  ${icon} [${issue.type}] ${issue.message}`);
      }
    }

    lines.push(`\nReconstructed: "${result.reconstructedQuery}"`);

    return lines.join('\n');
  }
}

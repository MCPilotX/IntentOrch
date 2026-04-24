/**
 * Tool Scorer
 *
 * Multi-dimensional scoring system for tool selection.
 * Scores tools based on semantic match (FlexSearch), parameter compatibility,
 * historical usage, and other factors.
 */

import { logger } from '../core/logger';
import type { Tool } from '../mcp/types';
import type { AtomicIntent } from './cloud-intent-engine';

// ==================== Type Definitions ====================

export interface ToolScore {
  toolName: string;
  totalScore: number;
  dimensions: ScoreDimension[];
  confidence: number;
}

export interface ScoreDimension {
  name: string;
  score: number;
  weight: number;
  details: string;
}

export interface ScoringContext {
  historicalUsage?: Map<string, number>;
  userPreferences?: Record<string, any>;
  conversationContext?: string;
  searchRankings?: Map<string, number>; // Map of tool name to FlexSearch ranking/score
}

// ==================== Main Scorer Class ====================

export class ToolScorer {
  /**
   * Score all available tools for a given intent
   */
  static scoreAll(
    intent: AtomicIntent,
    tools: Tool[],
    context?: ScoringContext,
  ): ToolScore[] {
    const scores: ToolScore[] = [];

    for (const tool of tools) {
      const score = ToolScorer.score(intent, tool, context);
      scores.push(score);
    }

    // Sort by total score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);

    return scores;
  }

  /**
   * Score a single tool for a given intent
   */
  static score(
    intent: AtomicIntent,
    tool: Tool,
    context?: ScoringContext,
  ): ToolScore {
    const dimensions: ScoreDimension[] = [];

    // Dimension 1: Search relevance (FlexSearch score) (weight: 0.45)
    const searchRelevance = ToolScorer.scoreSearchRelevance(tool.name, context);
    dimensions.push(searchRelevance);

    // Dimension 2: Name/description semantic match (weight: 0.10)
    const nameMatch = ToolScorer.scoreNameMatch(intent, tool);
    dimensions.push(nameMatch);

    // Dimension 3: Parameter compatibility (weight: 0.30)
    const paramCompat = ToolScorer.scoreParameterCompatibility(intent, tool);
    dimensions.push(paramCompat);

    // Dimension 4: Historical usage (weight: 0.05)
    const historyScore = ToolScorer.scoreHistoricalUsage(tool.name, context);
    dimensions.push(historyScore);

    // Dimension 5: Intent type alignment (weight: 0.10)
    const typeAlignment = ToolScorer.scoreIntentTypeAlignment(intent, tool);
    dimensions.push(typeAlignment);

    // Calculate weighted total
    let totalScore = 0;
    let totalWeight = 0;

    for (const dim of dimensions) {
      totalScore += dim.score * dim.weight;
      totalWeight += dim.weight;
    }

    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      toolName: tool.name,
      totalScore: normalizedScore,
      dimensions,
      confidence: ToolScorer.calculateConfidence(normalizedScore, dimensions),
    };
  }

  /**
   * Score based on FlexSearch relevance
   */
  private static scoreSearchRelevance(
    toolName: string,
    context?: ScoringContext,
  ): ScoreDimension {
    // If we have search ranking from FlexSearch, use it
    const searchScore = context?.searchRankings?.get(toolName);
    
    if (searchScore !== undefined) {
      return {
        name: 'search_relevance',
        score: searchScore,
        weight: 0.40,
        details: `FlexSearch relevance score: ${searchScore.toFixed(2)}`,
      };
    }

    return {
      name: 'search_relevance',
      score: 0.5, // Default neutral score
      weight: 0.40,
      details: 'No direct search ranking available',
    };
  }

  /**
   * Score based on tool name and description matching the intent
   */
  private static scoreNameMatch(
    intent: AtomicIntent,
    tool: Tool,
  ): ScoreDimension {
    const intentType = intent.type || '';
    const intentDesc = intent.description || '';
    const toolName = tool.name || '';
    const toolDesc = tool.description || '';

    const intentText = `${intentDesc} ${intentType}`.toLowerCase();
    const toolText = `${toolName} ${toolDesc}`.toLowerCase();

    // Tokenize and find overlap - handle both English and Chinese text
    const intentTokens = ToolScorer.tokenizeForMatch(intentText);
    const toolTokens = ToolScorer.tokenizeForMatch(toolText);

    if (intentTokens.size === 0 || toolTokens.size === 0) {
      return {
        name: 'name_match',
        score: 0,
        weight: 0.35,
        details: 'No meaningful tokens to compare',
      };
    }

    // Count matching tokens
    let matchCount = 0;
    const matchedTerms: string[] = [];

    for (const token of toolTokens) {
      if (intentTokens.has(token)) {
        matchCount++;
        matchedTerms.push(token);
      }
    }

    // For Chinese text, also check character-level overlap
    const hasChinese = /[\u4e00-\u9fff]/.test(intentText) && /[\u4e00-\u9fff]/.test(toolText);
    let charOverlapScore = 0;
    
    if (hasChinese) {
      // Extract Chinese characters from both texts
      const intentChars = new Set(intentText.replace(/[^\u4e00-\u9fff]/g, ''));
      const toolChars = toolText.replace(/[^\u4e00-\u9fff]/g, '');
      
      if (intentChars.size > 0 && toolChars.length > 0) {
        let charMatchCount = 0;
        for (const char of toolChars) {
          if (intentChars.has(char)) {
            charMatchCount++;
          }
        }
        const charUnion = new Set([...intentChars, ...toolChars.split('')]);
        charOverlapScore = charUnion.size > 0 ? charMatchCount / charUnion.size : 0;
      }
    }

    // Calculate Jaccard similarity
    const union = new Set([...intentTokens, ...toolTokens]);
    const jaccard = union.size > 0 ? matchCount / union.size : 0;

    // Boost score if tool name directly matches intent type
    const typeBoost = (intentType && toolName.toLowerCase().includes(intentType.toLowerCase())) ? 0.2 : 0;

    // Boost score if tool name contains key intent words
    const intentWords = intentDesc.split(/\s+/).filter(w => w.length > 2);
    const nameWordBoost = intentWords.some(w => toolName.toLowerCase().includes(w.toLowerCase())) ? 0.1 : 0;

    // For Chinese text, blend Jaccard and character overlap
    let score: number;
    if (hasChinese) {
      score = Math.min(1, jaccard * 0.4 + charOverlapScore * 0.6 + typeBoost + nameWordBoost);
    } else {
      score = Math.min(1, jaccard + typeBoost + nameWordBoost);
    }

    return {
      name: 'name_match',
      score,
      weight: 0.35,
      details: matchedTerms.length > 0
        ? `Matched terms: ${matchedTerms.join(', ')}`
        : 'No direct term matches found',
    };
  }

  /**
   * Tokenize text for matching, supporting both English and Chinese
   */
  private static tokenizeForMatch(text: string): Set<string> {
    const tokens = new Set<string>();
    
    // Extract English words (3+ chars)
    const englishTokens = text.match(/[a-z][a-z0-9_]{2,}/g);
    if (englishTokens) {
      englishTokens.forEach(t => tokens.add(t));
    }
    
    // Extract Chinese bigrams (2-char sliding windows)
    const chineseChars = text.replace(/[^\u4e00-\u9fff]/g, '');
    if (chineseChars.length >= 2) {
      for (let i = 0; i <= chineseChars.length - 2; i++) {
        tokens.add(chineseChars.slice(i, i + 2));
      }
    }
    
    return tokens;
  }

  /**
   * Score based on parameter compatibility between intent and tool
   */
  private static scoreParameterCompatibility(
    intent: AtomicIntent,
    tool: Tool,
  ): ScoreDimension {
    const schema = tool.inputSchema;
    const properties = schema?.properties || {};
    const required = schema?.required || [];
    const intentParams = intent.parameters || {};

    if (Object.keys(properties).length === 0) {
      return {
        name: 'parameter_compatibility',
        score: 0.5, // Neutral score for tools with no parameters
        weight: 0.30,
        details: 'Tool has no parameters defined',
      };
    }

    // Check how many intent parameters match tool parameters
    const intentParamNames = Object.keys(intentParams).map(k => k.toLowerCase());
    const toolParamNames = Object.keys(properties);

    let matchCount = 0;
    const matchedParams: string[] = [];

    for (const toolParam of toolParamNames) {
      const toolParamLower = toolParam.toLowerCase();
      if (intentParamNames.includes(toolParamLower)) {
        matchCount++;
        matchedParams.push(toolParam);
      } else {
        // Check for semantic similarity
        const similar = intentParamNames.some(ip => {
          return (
            ip.includes(toolParamLower) ||
            toolParamLower.includes(ip) ||
            ToolScorer.areParametersSimilar(ip, toolParamLower)
          );
        });
        if (similar) {
          matchCount += 0.5;
          matchedParams.push(`${toolParam} (semantic)`);
        }
      }
    }

    // Calculate coverage of required parameters
    const requiredCovered = required.filter(r =>
      intentParamNames.includes(r.toLowerCase()) ||
      matchedParams.some(m => m.startsWith(r)),
    ).length;

    const requiredRatio = required.length > 0 ? requiredCovered / required.length : 1;

    // Score based on parameter match ratio and required coverage
    const matchRatio = toolParamNames.length > 0 ? matchCount / toolParamNames.length : 0;
    const score = (matchRatio * 0.6 + requiredRatio * 0.4);

    return {
      name: 'parameter_compatibility',
      score: Math.min(1, score),
      weight: 0.30,
      details: matchedParams.length > 0
        ? `Matched ${matchedParams.length}/${toolParamNames.length} parameters: ${matchedParams.join(', ')}`
        : 'No parameter matches found',
    };
  }

  /**
   * Score based on historical usage frequency
   */
  private static scoreHistoricalUsage(
    toolName: string,
    context?: ScoringContext,
  ): ScoreDimension {
    if (!context?.historicalUsage || context.historicalUsage.size === 0) {
      return {
        name: 'historical_usage',
        score: 0.5, // Neutral score when no history
        weight: 0.20,
        details: 'No historical usage data available',
      };
    }

    const usageCount = context.historicalUsage.get(toolName) || 0;
    const maxUsage = Math.max(...Array.from(context.historicalUsage.values()));

    if (maxUsage === 0) {
      return {
        name: 'historical_usage',
        score: 0.5,
        weight: 0.20,
        details: 'No historical usage data available',
      };
    }

    const score = usageCount / maxUsage;

    return {
      name: 'historical_usage',
      score,
      weight: 0.20,
      details: `Used ${usageCount} times (max: ${maxUsage})`,
    };
  }

  /**
   * Score based on intent type alignment with tool capabilities
   */
  private static scoreIntentTypeAlignment(
    intent: AtomicIntent,
    tool: Tool,
  ): ScoreDimension {
    const intentType = (intent.type || '').toLowerCase();
    const toolName = (tool.name || '').toLowerCase();
    const toolDesc = (tool.description || '').toLowerCase();

    // Generic intent type to tool keyword mappings based on standard actions
    const typeKeywords: Record<string, string[]> = {
      'query': ['get', 'list', 'search', 'find', 'query', 'read', 'fetch', 'retrieve'],
      'action': ['create', 'update', 'delete', 'set', 'run', 'execute', 'start', 'stop'],
      'search': ['search', 'find', 'lookup', 'query', 'filter'],
    };

    const keywords = typeKeywords[intentType] || (intentType ? [intentType] : []);

    // Check if tool name or description contains relevant keywords
    let matchCount = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of keywords) {
      if (toolName.includes(keyword) || toolDesc.includes(keyword)) {
        matchCount++;
        matchedKeywords.push(keyword);
      }
    }

    const score = keywords.length > 0 ? matchCount / keywords.length : 0;

    return {
      name: 'intent_type_alignment',
      score: Math.min(1, score * 1.5), // Boost to make more impactful
      weight: 0.15,
      details: matchedKeywords.length > 0
        ? `Aligned with intent type "${intentType}": ${matchedKeywords.join(', ')}`
        : `No alignment with intent type "${intentType}"`,
    };
  }

  /**
   * Calculate overall confidence from scores using a more robust non-linear approach
   */
  private static calculateConfidence(
    totalScore: number,
    dimensions: ScoreDimension[],
  ): number {
    // 1. Base confidence starts with total score
    let confidence = totalScore;

    // 2. Identify key dimension scores
    const searchRelevance = dimensions.find(d => d.name === 'search_relevance')?.score || 0;
    const paramCompat = dimensions.find(d => d.name === 'parameter_compatibility')?.score || 0;
    
    // 3. Boost confidence if we have strong signal from both search and parameters
    // This represents high structural and semantic alignment
    if (searchRelevance > 0.8 && paramCompat > 0.6) {
      confidence += 0.15;
    }

    // 4. Penalty for high disagreement (standard deviation based)
    const scores = dimensions.map(d => d.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Only penalize if scores are wildly inconsistent AND the total score is already low
    if (stdDev > 0.4 && totalScore < 0.5) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Check if two parameter names are semantically similar
   */
  private static areParametersSimilar(a: string, b: string): boolean {
    const synonymGroups = [
      ['name', 'title', 'label', 'id'],
      ['path', 'location', 'address', 'route', 'directory'],
      ['query', 'search', 'filter', 'keyword', 'term'],
      ['content', 'data', 'text', 'body', 'message', 'value'],
      ['date', 'time', 'datetime', 'timestamp', 'schedule'],
      ['count', 'limit', 'number', 'size', 'max', 'quantity'],
      ['source', 'origin', 'from', 'input'],
      ['target', 'destination', 'to', 'output'],
      ['enabled', 'active', 'on', 'flag'],
      ['type', 'category', 'kind', 'sort', 'class'],
    ];

    for (const group of synonymGroups) {
      if (group.includes(a) && group.includes(b)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the best tool match from scored results
   */
  static getBestMatch(scores: ToolScore[]): ToolScore | null {
    if (scores.length === 0) {
      return null;
    }

    const best = scores[0];

    // Only return if confidence is above threshold
    if (best.confidence < 0.2) {
      return null;
    }

    return best;
  }

  /**
   * Get top N tool matches
   */
  static getTopMatches(scores: ToolScore[], n: number = 3): ToolScore[] {
    return scores.slice(0, n).filter(s => s.confidence >= 0.2);
  }
}

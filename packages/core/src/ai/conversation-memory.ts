/**
 * Conversation Memory
 *
 * Manages multi-turn conversation context for intent parsing.
 * Provides context inheritance, elliptical query detection, and user preference learning.
 */

import { logger } from '../core/logger';

// ==================== Type Definitions ====================

export interface ConversationTurn {
  query: string;
  parsedIntents: AtomicIntentSnapshot[];
  selectedToolName?: string;
  extractedParameters: Record<string, any>;
  executionResult?: any;
  executionSuccess?: boolean;
  timestamp: Date;
}

export interface AtomicIntentSnapshot {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
}

export interface InferredContext {
  inheritedAction: string;
  inheritedParameters: Record<string, any>;
  confidence: number;
  reasoning: string;
}

export interface UserPreference {
  parameterName: string;
  preferredValue: any;
  frequency: number;
  lastUsed: Date;
}

// ==================== Main Memory Class ====================

export class ConversationMemory {
  private sessions: Map<string, ConversationTurn[]> = new Map();
  private preferences: Map<string, UserPreference[]> = new Map();
  private readonly maxTurnsPerSession = 20;

  /**
   * Add a conversation turn to a session
   */
  addTurn(sessionId: string, turn: ConversationTurn): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }

    const turns = this.sessions.get(sessionId)!;
    turns.push(turn);

    // Keep only recent turns
    if (turns.length > this.maxTurnsPerSession) {
      turns.splice(0, turns.length - this.maxTurnsPerSession);
    }

    // Update user preferences based on successful executions
    if (turn.executionSuccess && turn.extractedParameters) {
      this.updatePreferences(sessionId, turn);
    }

    logger.debug(`[ConversationMemory] Added turn ${turns.length} to session ${sessionId}`);
  }

  /**
   * Get recent turns from a session
   */
  getRecentTurns(sessionId: string, count: number = 3): ConversationTurn[] {
    const turns = this.sessions.get(sessionId);
    if (!turns || turns.length === 0) {
      return [];
    }
    return turns.slice(-count);
  }

  /**
   * Get the last turn from a session
   */
  getLastTurn(sessionId: string): ConversationTurn | undefined {
    const turns = this.sessions.get(sessionId);
    if (!turns || turns.length === 0) {
      return undefined;
    }
    return turns[turns.length - 1];
  }

  /**
   * Detect if a query is elliptical (needs context inheritance)
   * Examples: "what about Shanghai", "and then", "continue", "next"
   */
  detectEllipticalQuery(query: string): boolean {
    const queryLower = query.toLowerCase().trim();

    // Direct follow-up patterns
    const ellipticalPatterns = [
      /^(what\s+about|how\s+about|what\s+is|what\s+are)\s+/i,
      /^(and\s+then|then|next|continue|go\s+on|proceed)/i,
      /^(that\s+one|the\s+same|again|also|too)/i,
      /^(instead|instead\s+of\s+that|something\s+else)/i,
      /^(show\s+me|tell\s+me|give\s+me)\s+(more|another|the\s+other)/i,
      /^(what\s+about|how\s+about)\s+.+/i,
    ];

    // Check if query is very short (likely a follow-up)
    const isShortQuery = queryLower.split(/\s+/).length <= 4;

    // Check if query starts with a conjunction or question word
    const startsWithConjunction = /^(and|but|or|so|then|also|too|yet)\b/i.test(queryLower);

    // Check if query is a single entity name (likely replacing a parameter)
    // Match any word characters (including Unicode letters from any language)
    const isSingleEntity = /^[\w]+$/.test(queryLower) && queryLower.split(/\s+/).length <= 2;

    return ellipticalPatterns.some(p => p.test(queryLower)) || isShortQuery || startsWithConjunction || isSingleEntity;
  }

  /**
   * Infer missing context from conversation history
   */
  inferMissingContext(
    sessionId: string,
    currentQuery: string,
  ): InferredContext | null {
    const lastTurn = this.getLastTurn(sessionId);
    if (!lastTurn) {
      return null;
    }

    const queryLower = currentQuery.toLowerCase().trim();

    // Case 1: "what about X" or "how about X" - replace parameter
    const whatAboutMatch = queryLower.match(/^(?:what|how)\s+about\s+(.+)/i);
    if (whatAboutMatch && lastTurn.selectedToolName) {
      const newValue = whatAboutMatch[1].trim();
      const inheritedParams = { ...lastTurn.extractedParameters };

      // Try to find which parameter to replace
      // Look for location-like, name-like, or query-like parameters
      const replaceableParams = Object.keys(inheritedParams).filter(key => {
        const keyLower = key.toLowerCase();
        return (
          keyLower.includes('name') ||
          keyLower.includes('city') ||
          keyLower.includes('location') ||
          keyLower.includes('query') ||
          keyLower.includes('search') ||
          keyLower.includes('keyword') ||
          keyLower.includes('id') ||
          keyLower.includes('target') ||
          keyLower.includes('source')
        );
      });

      if (replaceableParams.length > 0) {
        // Replace the first replaceable parameter
        const paramToReplace = replaceableParams[0];
        const oldValue = inheritedParams[paramToReplace];
        inheritedParams[paramToReplace] = newValue;

        return {
          inheritedAction: lastTurn.selectedToolName,
          inheritedParameters: inheritedParams,
          confidence: 0.85,
          reasoning: `Inherited action "${lastTurn.selectedToolName}" from previous turn, replaced parameter "${paramToReplace}" from "${oldValue}" to "${newValue}"`,
        };
      }

      // If no specific parameter to replace, pass the new value as the main parameter
      return {
        inheritedAction: lastTurn.selectedToolName,
        inheritedParameters: { ...inheritedParams, query: newValue },
        confidence: 0.7,
        reasoning: `Inherited action "${lastTurn.selectedToolName}" with new value "${newValue}"`,
      };
    }

    // Case 2: "and then", "next", "continue" - repeat last action
    if (/^(and\s+then|then|next|continue|go\s+on|proceed)$/i.test(queryLower)) {
      return {
        inheritedAction: lastTurn.selectedToolName || '',
        inheritedParameters: { ...lastTurn.extractedParameters },
        confidence: 0.6,
        reasoning: `Repeating last action "${lastTurn.selectedToolName}"`,
      };
    }

    // Case 3: Single word/entity - likely a parameter replacement
    if (/^[\w]+$/.test(queryLower) && queryLower.split(/\s+/).length <= 2) {
      if (lastTurn.selectedToolName) {
        const inheritedParams = { ...lastTurn.extractedParameters };
        const replaceableParams = Object.keys(inheritedParams).filter(key => {
          const keyLower = key.toLowerCase();
          return (
            keyLower.includes('name') ||
            keyLower.includes('city') ||
            keyLower.includes('location') ||
            keyLower.includes('query') ||
            keyLower.includes('search') ||
            keyLower.includes('keyword') ||
            keyLower.includes('id')
          );
        });

        if (replaceableParams.length > 0) {
          const paramToReplace = replaceableParams[0];
          inheritedParams[paramToReplace] = currentQuery;

          return {
            inheritedAction: lastTurn.selectedToolName,
            inheritedParameters: inheritedParams,
            confidence: 0.75,
            reasoning: `Inherited action "${lastTurn.selectedToolName}", replaced parameter "${paramToReplace}" with "${currentQuery}"`,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get user preferences for a session
   */
  getUserPreferences(sessionId: string): Record<string, any> {
    const prefs = this.preferences.get(sessionId);
    if (!prefs || prefs.length === 0) {
      return {};
    }

    const result: Record<string, any> = {};
    for (const pref of prefs) {
      // Only include preferences used more than once
      if (pref.frequency > 1) {
        result[pref.parameterName] = pref.preferredValue;
      }
    }

    return result;
  }

  /**
   * Clear session memory
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.preferences.delete(sessionId);
    logger.debug(`[ConversationMemory] Cleared session ${sessionId}`);
  }

  /**
   * Clear all sessions
   */
  clearAll(): void {
    this.sessions.clear();
    this.preferences.clear();
    logger.debug('[ConversationMemory] Cleared all sessions');
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Build conversation context string for LLM prompt
   */
  buildConversationContext(sessionId: string): string {
    const turns = this.getRecentTurns(sessionId, 3);
    if (turns.length === 0) {
      return '';
    }

    const lines: string[] = ['## Conversation History'];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      lines.push(`\n### Turn ${i + 1}`);
      lines.push(`User: "${turn.query}"`);

      if (turn.selectedToolName) {
        lines.push(`Action: ${turn.selectedToolName}`);
        if (Object.keys(turn.extractedParameters).length > 0) {
          lines.push(`Parameters: ${JSON.stringify(turn.extractedParameters, null, 2)}`);
        }
      }

      if (turn.executionSuccess !== undefined) {
        lines.push(`Result: ${turn.executionSuccess ? 'Success' : 'Failed'}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Update user preferences based on successful execution
   */
  private updatePreferences(sessionId: string, turn: ConversationTurn): void {
    if (!this.preferences.has(sessionId)) {
      this.preferences.set(sessionId, []);
    }

    const prefs = this.preferences.get(sessionId)!;

    for (const [paramName, paramValue] of Object.entries(turn.extractedParameters)) {
      const existingPref = prefs.find(p => p.parameterName === paramName);

      if (existingPref) {
        if (existingPref.preferredValue === paramValue) {
          existingPref.frequency++;
        } else {
          // New value, reset frequency
          existingPref.preferredValue = paramValue;
          existingPref.frequency = 1;
        }
        existingPref.lastUsed = new Date();
      } else {
        prefs.push({
          parameterName: paramName,
          preferredValue: paramValue,
          frequency: 1,
          lastUsed: new Date(),
        });
      }
    }

    // Keep only top 10 preferences
    if (prefs.length > 10) {
      prefs.sort((a, b) => b.frequency - a.frequency);
      this.preferences.set(sessionId, prefs.slice(0, 10));
    }
  }
}

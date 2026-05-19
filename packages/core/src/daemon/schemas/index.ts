/**
 * Zod validation schemas for Daemon API endpoints.
 *
 * Each schema corresponds to an API endpoint's request body, query params, or response shape.
 */

import { z } from "zod";

// ==================== Common ====================

export const PaginationQuery = z.object({
  limit: z.coerce.number().int().positive().optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ==================== AI Schemas ====================

export const AITestBody = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

// ==================== Config Schemas ====================

export const ConfigUpdateBody = z.object({
  ai: z
    .object({
      provider: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
  registry: z
    .object({
      default: z.string().optional(),
      fallback: z.string().optional(),
    })
    .optional(),
});

// ==================== Server Schemas ====================

export const StartServerBody = z.object({
  serverNameOrUrl: z.string().min(1, "serverNameOrUrl is required"),
});

export const ImportServersBody = z.object({
  config: z.string().min(1, "config is required"),
});

export const PullServerBody = z.object({
  serverNameOrUrl: z.string().min(1, "serverNameOrUrl is required"),
});

export const ServerSearchQuery = z.object({
  q: z.string().optional().default(""),
  source: z.string().optional().default("all"),
});

// ==================== Secrets Schemas ====================

export const SetSecretBody = z.object({
  key: z.string().min(1, "key is required"),
  value: z.string().min(1, "value is required"),
});

// ==================== Execution/Session Schemas ====================

export const CreateSessionBody = z.object({
  query: z.string().min(1, "query is required"),
  type: z.enum(["direct", "interactive"]).optional().default("direct"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SessionExecuteBody = z.object({
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

export const SessionFeedbackBody = z.object({
  type: z.enum(["confirm", "modify", "reject", "regenerate"]),
  message: z.string().optional(),
  modifiedPlan: z.record(z.string(), z.unknown()).optional(),
});

// ==================== Legacy Execution Schemas ====================

export const NaturalLanguageBody = z.object({
  query: z.string().min(1, "query is required"),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const ParseIntentBody = z.object({
  intent: z.string().min(1, "intent is required"),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const ExecuteStepsBody = z.object({
  steps: z.array(z.record(z.string(), z.unknown())).min(1, "steps must be a non-empty array"),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const InteractiveStartBody = z.object({
  query: z.string().min(1, "query is required"),
});

export const InteractiveRespondBody = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  response: z
    .object({
      type: z.string().optional(),
      clarification: z.string().optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export const InteractiveExecuteBody = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

export const InteractiveCleanupBody = z.object({
  // No required fields, kept for compatibility
}).optional();

// ==================== Workflow Schemas ====================

export const SaveWorkflowBody = z.record(z.string(), z.unknown());

// ==================== Response Schemas ====================

export const SuccessResponse = z.object({
  success: z.boolean(),
});

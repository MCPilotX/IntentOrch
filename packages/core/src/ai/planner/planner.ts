import { LLMClient } from "../llm-client.js";
import { ToolInfo } from "../../execution/tool-executor/index.js";
import { ToolExecutionPlan } from "../cloud-intent-engine.js";
import { logger } from "../../core/logger.js";

export interface PlannerConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class Planner {
  constructor(private llmClient: LLMClient) {}

  async plan(
    query: string,
    availableTools: ToolInfo[],
    config: PlannerConfig = {},
  ): Promise<ToolExecutionPlan> {
    logger.info(`[Planner] Generating plan for query: "${query.substring(0, 100)}..."`);
    
    // Implementation will be moved here from CloudIntentEngine.parseResponseToPlan
    // and CloudIntentEngine.planQuery
    return {} as ToolExecutionPlan; 
  }
}

import { Interceptor, InterceptorContext } from "../interceptor.js";
import { getLLMClient } from "../../ai/llm-client.js";
import { logger } from "../logger.js";
import type { ToolInfo } from "../../execution/tool-executor/index.js";

/**
 * Input for tool execution interceptors
 */
export interface ToolInterceptorInput {
  toolName: string;
  arguments: Record<string, unknown>;
  toolMetadata?: ToolInfo;
}

/**
 * AutoRepairInterceptor provides self-healing for tool parameter failures.
 * When a tool call fails (e.g. missing parameters, wrong types), it initiates
 * a lightweight secondary inference with the LLM to fix the parameters.
 */
export class AutoRepairInterceptor implements Interceptor<ToolInterceptorInput, any> {
  name = "AutoRepair";
  private maxRetries = 1;

  async onError(
    ctx: InterceptorContext<ToolInterceptorInput, any>,
    error: Error
  ): Promise<any | void> {
    const { input, span, metadata } = ctx;
    
    // Check if we've already tried repairing this specific call to avoid infinite loops
    const retryCount = (metadata.repairAttempts || 0);
    if (retryCount >= this.maxRetries) {
      return undefined;
    }

    // Identify repairable errors: parameter mapping, validation, or specific MCP server rejections
    const errorMessage = error.message.toLowerCase();
    const isParameterError = 
      errorMessage.includes("parameter") || 
      errorMessage.includes("argument") || 
      errorMessage.includes("required") || 
      errorMessage.includes("validation") ||
      errorMessage.includes("type mismatch") ||
      errorMessage.includes("invalid params");

    if (!isParameterError) {
      return undefined;
    }

    logger.info(`[AutoRepair] 🩹 Attempting to repair parameter error for tool "${input.toolName}": ${error.message}`);
    
    if (span) {
      span.metadata.repairStarted = true;
      span.metadata.repairReason = error.message;
    }

    try {
      const llmClient = getLLMClient();
      if (!llmClient.isConfigured()) {
        return undefined;
      }

      // 1. Construct a repair prompt
      const schema = input.toolMetadata?.inputSchema 
        ? JSON.stringify(input.toolMetadata.inputSchema, null, 2) 
        : "Not available";
      
      const repairPrompt = `
You are a tool-use repair specialist. A previous tool call failed due to a parameter error.
Your goal is to provide the CORRECT parameters based on the tool schema and the error message.

TOOL NAME: ${input.toolName}
FAILED PARAMETERS: ${JSON.stringify(input.arguments)}
ERROR MESSAGE: ${error.message}
TOOL SCHEMA: ${schema}

Please output ONLY a JSON object containing the fixed parameters. Do not include any explanation.
`.trim();

      // 2. Execute secondary inference
      const response = await llmClient.chat({
        messages: [
          { role: "system", content: "You are a precise JSON generator. Output ONLY valid JSON." },
          { role: "user", content: repairPrompt }
        ],
        temperature: 0.1, // High precision
        responseFormat: { type: "json_object" }
      });

      let fixedParams: Record<string, unknown>;
      try {
        fixedParams = JSON.parse(response.text);
      } catch (e) {
        logger.warn(`[AutoRepair] LLM output was not valid JSON: ${response.text}`);
        return undefined;
      }

      logger.info(`[AutoRepair] ✨ LLM suggested fixed parameters: ${JSON.stringify(fixedParams)}`);

      if (span) {
        span.metadata.repairedParams = fixedParams;
      }

      // 3. Retry the execution with fixed parameters
      const executeToolFn = metadata.executeToolFn as (toolName: string, params: Record<string, unknown>) => Promise<any>;
      if (!executeToolFn) {
        logger.warn("[AutoRepair] executeToolFn not found in context metadata, cannot retry");
        return undefined;
      }

      // Increment retry count to prevent infinite loops
      metadata.repairAttempts = retryCount + 1;
      
      const result = await executeToolFn(input.toolName, fixedParams);
      
      logger.info(`[AutoRepair] ✅ Successfully repaired and executed tool "${input.toolName}"`);
      
      if (span) {
        span.metadata.repairSuccess = true;
      }

      return result;
    } catch (repairError: unknown) {
      logger.error(`[AutoRepair] ❌ Repair attempt failed: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
      if (span) {
        span.metadata.repairFailed = true;
        span.metadata.repairError = repairError instanceof Error ? repairError.message : String(repairError);
      }
      return undefined;
    }
  }
}

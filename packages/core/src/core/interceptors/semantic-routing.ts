import { Interceptor, InterceptorContext } from "../interceptor.js";
import { getRoutingEvaluationRepository } from "../../utils/sqlite.js";
import { logger } from "../logger.js";
import { UnifiedExecutionResult } from "../../ai/execute-service.js";

/**
 * SemanticRoutingInterceptor evaluates the quality of AI tool routing.
 * It compares the planned steps with the actual execution results to 
 * calculate routing accuracy and success rates.
 */
export class SemanticRoutingInterceptor implements Interceptor {
  name = "SemanticRoutingGovernance";

  async after(ctx: InterceptorContext<any, UnifiedExecutionResult>): Promise<void> {
    const { span, output, input } = ctx;
    if (!span || !output) return;

    try {
      const plannedTools = output.steps?.map(s => s.toolName) || [];
      const executedTools = output.executionSteps?.map(s => s.toolName) || [];
      
      const successfulSteps = output.executionSteps?.filter(s => s.success).length || 0;
      const totalSteps = output.executionSteps?.length || 0;
      const successRate = totalSteps > 0 ? successfulSteps / totalSteps : 0;

      // Accuracy: check that all planned tools were among the executed tools.
      // In ReAct mode, the LLM may dynamically add or reorder tools, so we use
      // subset matching rather than strict length equality.
      // isAccurate = true if every planned tool was executed successfully.
      const plannedSet = new Set(plannedTools);
      const executedSet = new Set(executedTools);
      const allPlannedWereExecuted = plannedTools.length === 0 || // no plan → skip accuracy
        plannedTools.every(t => executedSet.has(t));
      const noUnexpectedFailures = output.executionSteps
        ? output.executionSteps.filter(s => !s.success).every(s => !plannedSet.has(s.toolName))
        : true;
      const isAccurate = successRate === 1.0 && allPlannedWereExecuted && noUnexpectedFailures;

      await getRoutingEvaluationRepository().create({
        traceId: span.traceId,
        query: span.metadata.query || "unknown",
        provider: span.metadata.provider,
        model: span.metadata.model,
        plannedTools,
        executedTools,
        successRate,
        isAccurate,
        errorDetails: output.error || null,
      });

      logger.info(`[Governance] Routing Evaluation saved for trace ${span.traceId}. Accuracy: ${isAccurate ? '✅' : '❌'} (${(successRate * 100).toFixed(1)}%)`);
    } catch (error) {
      logger.warn(`[Governance] Failed to record routing evaluation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onError(ctx: InterceptorContext<any, UnifiedExecutionResult>, error: Error): Promise<void> {
    const { span, input } = ctx;
    if (!span) return;

    try {
      await getRoutingEvaluationRepository().create({
        traceId: span.traceId,
        query: span.metadata.query || "unknown",
        successRate: 0,
        isAccurate: false,
        errorDetails: error.message,
      });
    } catch (persistError) {
      // Ignore persistence errors in error handler
    }
  }
}

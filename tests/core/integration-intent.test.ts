/**
 * Integration Intent Test
 * 
 * Formalized integration test for verifying the full AI intent planning loop.
 * This test hits real LLM providers (e.g., DeepSeek, OpenAI) and is skipped by default
 * in CI environments to prevent flaky failures due to network or API limits.
 * 
 * To run manually:
 * ALLOW_REAL_AI=true npx jest tests/core/integration-intent.test.ts
 */

import { IntentorchAdapter } from "../../packages/core/src/ai/intentorch-adapter.js";
import { getAIConfig } from "../../packages/core/src/core/config-service.js";

const itIfRealAI = process.env.ALLOW_REAL_AI === "true" ? it : it.skip;

describe("AI Intent Integration", () => {
  itIfRealAI("correctly plans a 12306 ticket query using real LLM", async () => {
    const query = "query 2026-05-03 Guangzhou to Nanning high-speed train tickets";
    
    // 1. Setup Configuration
    const aiConfig = await getAIConfig();
    expect(aiConfig.apiKey).toBeDefined();
    
    // 2. Initialize Engine
    const testAdapter = new IntentorchAdapter();
    await testAdapter.configureAI(aiConfig);
    await testAdapter.initCloudIntentEngine();

    // 3. Inject Mock Tool Metadata (to simulate discovered MCP tools)
    const mockTools = [
      {
        name: "query_left_tickets",
        description: "Query 12306 ticket availability",
        serverName: "Joooook/12306-mcp",
        inputSchema: {
          type: "object",
          properties: {
            from_station: { type: "string" },
            to_station: { type: "string" },
            train_date: { type: "string" },
          },
          required: ["from_station", "to_station", "train_date"],
        },
      },
    ];

    const engine = (testAdapter as any).cloudIntentEngine;
    expect(engine).toBeDefined();
    engine.setAvailableTools(mockTools);

    // 4. Execute Planning
    const plan = await engine.planQuery(query);

    // 5. Verification
    expect(plan).toBeDefined();
    expect(plan.steps).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
    
    const firstStep = plan.steps[0];
    expect(firstStep.toolName).toBe("query_left_tickets");
    
    // Verify parameters identified by AI
    const args = firstStep.arguments;
    expect(args.from_station).toMatch(/Guangzhou|广州/i);
    expect(args.to_station).toMatch(/Nanning|南宁/i);
    expect(args.train_date).toBe("2026-05-03");
  }, 60000); // Allow 60s for LLM response
});

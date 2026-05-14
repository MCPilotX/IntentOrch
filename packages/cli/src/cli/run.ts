/**
 * Unified Run Command
 *
 * Uses the new UnifiedExecutionService to provide the same execution
 * capabilities for both CLI and Web.
 *
 * This is a simplified version of the original run command that uses
 * the shared unified execution service.
 */

import http from "http";
import { Command } from "commander";
import {
  getExecuteService,
  getAIConfig,
  PROGRAM_NAME,
  printError,
} from "@intentorch/core";

/**
 * Convert MCP response format to standard format
 * MCP response: { content: [{ type: "text", text: "..." }] }
 * Standard format: { result: ... }
 */
function convertMCPResponse(response: any): any {
  if (!response) return response;

  // If response already has result field, return as is
  if (response.result !== undefined) {
    return response;
  }

  // Convert content array to result
  if (response.content && Array.isArray(response.content)) {
    // Extract text from content
    const textContent = response.content
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("\n");

    // If there's text content, return it as result
    if (textContent) {
      return { ...response, result: textContent };
    }

    // If there's only one content item, return it directly
    if (response.content.length === 1) {
      return { ...response, result: response.content[0] };
    }
  }

  // Return original response if we can't convert it
  return response;
}

/**
 * Convert step results in execution steps
 */
function convertStepResults(executionSteps: any[]): any[] {
  if (!executionSteps || !Array.isArray(executionSteps)) {
    return executionSteps;
  }

  return executionSteps.map((step) => {
    if (step.result) {
      return {
        ...step,
        result: convertMCPResponse(step.result),
      };
    }
    return step;
  });
}

/**
 * Display execution results in a user-friendly format
 */
function displayExecutionResults(result: any, options: any) {
  const convertedResult = {
    ...result,
    executionSteps: convertStepResults(result.executionSteps),
    result: convertMCPResponse(result.result),
  };

  if (convertedResult.success) {
    // Show the final result output — this is the LLM's summary or the tool's final result
    if (convertedResult.result) {
      const finalResult =
        typeof convertedResult.result === "string"
          ? convertedResult.result
          : convertedResult.result.result || JSON.stringify(convertedResult.result, null, 2);
      
      if (!options.silent) {
        console.log("\n" + "=".repeat(50));
        console.log("🎉 Execution completed");
        console.log("=".repeat(50));
        console.log(`\n${finalResult}`);
      } else {
        console.log(finalResult);
      }
    } else {
      if (!options.silent) {
        console.log("\n✅ Execution completed successfully.");
      }
    }
  } else {
    console.log(`\n❌ Execution failed`);
    if (convertedResult.error) {
      console.log(`\n${convertedResult.error}`);
    }
  }
}

/**
 * Execute a natural language query with SSE streaming, displaying results as they arrive.
 */
function executeNaturalLanguageStream(
  query: string,
  options: any,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, options: { autoStart: options.autoStart, silent: true } });
    const daemonPort = 9658;

    const req = http.request(
      {
        hostname: "localhost",
        port: daemonPort,
        path: "/api/execute/natural-language-stream",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);

              if (event.type === "step_result") {
                // Display each step result as it arrives
                const status = event.success ? "✅" : "❌";
                const stepName = event.toolName || "Unknown";

                console.log(`  ${status} ${stepName}`);
                if (event.error) {
                  console.log(`     Error: ${event.error}`);
                }
              } else if (event.type === "complete") {
                if (event.success) {
                  // Extract the final result text — prefer the MCP text content
                  let finalOutput = "✅ Execution completed successfully.";
                  if (event.result) {
                    const r = event.result as any;
                    if (typeof r === "string") {
                      finalOutput = r;
                    } else if (r.content && Array.isArray(r.content)) {
                      const texts = r.content
                        .filter((c: any) => c.type === "text")
                        .map((c: any) => c.text)
                        .filter(Boolean);
                      if (texts.length > 0) {
                        finalOutput = texts.join("\n");
                      }
                    }
                  }

                  if (!options.silent) {
                    console.log(`\n${finalOutput}`);
                  } else {
                    console.log(finalOutput);
                  }
                  resolve({ success: true });
                } else {
                  console.log(`\n❌ Execution failed`);
                  if (event.error) {
                    console.log(`\n${event.error}`);
                  }
                  resolve({ success: false, error: event.error });
                }
              } else if (event.type === "error") {
                console.log(`\n❌ Error: ${event.error}`);
                resolve({ success: false, error: event.error });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        });

        res.on("end", () => {
          // If we haven't resolved yet, resolve with success
          resolve({ success: true });
        });

        res.on("error", (err) => {
          reject(err);
        });
      },
    );

    req.on("error", (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

export function runCommand(): Command {
  const command = new Command("run")
    .description(
      "Execute natural language workflow, JSON workflow file, or named workflow using unified execution service",
    )
    .argument(
      "<input>",
      "Natural language query, JSON file path, or workflow name",
    )
    .option("--auto-start", "Automatically pull and start required Server")
    .option(
      "--keep-alive",
      "Keep Server running after execution (only with --auto-start)",
    )
    .option(
      "-p, --params <json>",
      "Parameters for named workflow or file (JSON format)",
      "{}",
    )
    .option("--silent", "Suppress verbose logs and initialization messages")
    .option(
      "--simulate",
      "Run in simulation mode (no real MCP Server required)",
    )
    .action(async (input: string, options) => {
      try {
        const executionService = getExecuteService();
        let params = {};

        try {
          params = JSON.parse(options.params);
        } catch (e) {
          printError("Invalid JSON params");
          return;
        }

        // 1. Check if it's a JSON file
        if (input.endsWith(".json")) {
          if (!options.silent) {
            console.log(`📄 Executing workflow from file: ${input}`);
          }

          const result = await executionService.executeWorkflowFromFile(
            input,
            params,
            {
              autoStart: options.autoStart,
              keepAlive: options.keepAlive,
              silent: options.silent,
              simulate: options.simulate,
            },
          );

          displayExecutionResults(result, options);
          return;
        }

        // 2. Check if it's a named workflow
        const workflowManager = (
          await import("@intentorch/core")
        ).getWorkflowManager();
        if (await workflowManager.exists(input)) {
          if (!options.silent) {
            console.log(`🏷️  Executing named workflow: "${input}"`);
          }

          const result = await executionService.executeNamedWorkflow(
            input,
            params,
            {
              autoStart: options.autoStart,
              keepAlive: options.keepAlive,
              silent: options.silent,
              simulate: options.simulate,
            },
          );

          displayExecutionResults(result, options);
          return;
        }

        // 3. Natural Language Execution
        if (!options.silent) {
          console.log("🎯 Starting natural language workflow execution");
          console.log(`📝 Query: "${input}"`);
          console.log("\n🔧 Initializing execution service...");
        }

        // Check AI configuration
        const aiConfig = await getAIConfig();

        if (!aiConfig.provider) {
          console.error("❌ AI configuration not set");
          console.log("\n💡 Please set AI configuration first:");
          console.log(
            `   ${PROGRAM_NAME} config set provider <openai|deepseek|ollama|...>`,
          );
          console.log(`   ${PROGRAM_NAME} config set apiKey <your-api-key>`);
          console.log(
            `   ${PROGRAM_NAME} config set model <model-name> (optional)`,
          );
          console.log(
            `   ${PROGRAM_NAME} config set apiEndpoint <endpoint-url> (optional, for Ollama)`,
          );
          return;
        }

        // For Ollama, apiKey is not required
        if (aiConfig.provider !== "ollama" && !aiConfig.apiKey) {
          console.error("❌ API key not set for provider:", aiConfig.provider);
          console.log("\n💡 Please set your API key:");
          console.log(`   ${PROGRAM_NAME} config set apiKey <your-api-key>`);
          return;
        }

        if (!options.silent) {
          console.log("   Configuring AI provider:", aiConfig.provider);
          console.log("✓ Execution service initialized");
        }

        // Try streaming execution first (SSE via daemon)
        // Falls back to non-streaming if daemon is not available
        const result = await executeNaturalLanguageStream(input, options);

        if (!result.success && result.error) {
          // Fall back to non-streaming execution
          if (!options.silent) {
            console.log("\n⚠️ Streaming execution failed, falling back to standard execution...");
          }
          const fallbackResult = await executionService.executeNaturalLanguage(input, {
            autoStart: options.autoStart,
            keepAlive: options.keepAlive,
            silent: options.silent,
            simulate: options.simulate,
            params,
          });

          displayExecutionResults(fallbackResult, options);

          // Ensure process exits
          setTimeout(() => { process.exit(0); }, 100);
        }
      } catch (error: any) {
        console.error("❌ Workflow execution failed:", error.message);
        console.log("\n💡 Suggestions:");
        console.log("1. Make sure AI configuration is set:");
        console.log(
          `   ${PROGRAM_NAME} config set provider <openai|deepseek|...>`,
        );
        console.log(`   ${PROGRAM_NAME} config set apiKey <your-api-key>`);
        console.log("2. Make sure required MCP Server is pulled and started:");
        console.log(`   ${PROGRAM_NAME} pull <server-name>`);
        console.log(`   ${PROGRAM_NAME} start <server-name>`);
        console.log("3. Or use --auto-start option");
        process.exit(1);
      }
    });

  return command;
}

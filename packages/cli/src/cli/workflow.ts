import { Command } from "commander";
import fs from "fs/promises";
import { getWorkflowManager } from "@intentorch/core";
import { WorkflowEngine } from "@intentorch/core";
import { Workflow } from "@intentorch/core";
import { getAIConfig } from "@intentorch/core";
import { getProcessManager } from "@intentorch/core";
import { getRegistryClient } from "@intentorch/core";
import { PROGRAM_NAME } from "@intentorch/core";

import enquirer from "enquirer";
const { prompt } = enquirer;

export function workflowCommand(): Command {
  const command = new Command("workflow").description(
    "Manage and execute reusable AI workflows",
  );

  // workflow create (Interactive Wizard)
  command
    .command("create")
    .description("Interactively create a workflow from natural language")
    .argument("<query>", "Natural language task description")
    .action(async (query: string) => {
      try {
        console.log("Using IntentOrch to analyze your task...");

        // 1. Configure AI
        const aiConfig = await getAIConfig();
        if (!aiConfig.provider || !aiConfig.apiKey) {
          throw new Error(
            `AI not configured. Run: ${PROGRAM_NAME} config set provider <p> && ${PROGRAM_NAME} config set apiKey <k>`,
          );
        }

        // Dynamically import intentorch to avoid initialization at import time
        const importedIntentorch = await import("@intentorch/core");
        const intentorch = importedIntentorch.default;

        // Temporarily suppress console output to avoid IntentOrch initialization logs
        const originalConsoleLog = console.log;
        const originalConsoleInfo = console.info;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        try {
          // Redirect all console output to empty functions
          console.log = () => {};
          console.info = () => {};
          console.error = () => {};
          console.warn = () => {};

          await (intentorch as any).configureAI(aiConfig);
          await (intentorch as any).initCloudIntentEngine();
        } finally {
          // Restore original console output
          console.log = originalConsoleLog;
          console.info = originalConsoleInfo;
          console.error = originalConsoleError;
          console.warn = originalConsoleWarn;
        }

        // 2. Connect to all running servers to gather available tools
        const pm = getProcessManager();
        const running = await pm.listRunning();
        const registry = getRegistryClient();
        for (const s of running) {
          const manifest = await registry.fetchManifest(s.serverName);
          await (intentorch as any).connectMCPServer({
            name: s.serverName,
            transport: {
              type: "stdio",
              command: manifest.runtime.command,
              args: manifest.runtime.args || [],
            },
          });
        }

        // 3. Generate Plan
        const planResult = await (intentorch as any).parseAndPlanWorkflow(
          query,
        );
        if (!planResult.success || !planResult.plan) {
          throw new Error(
            `IntentOrch failed to generate plan: ${planResult.error}`,
          );
        }

        const plan = planResult.plan;

        // Display workflow plan
        console.log("\nAI Generated Workflow Plan:");
        plan.toolSelections.forEach((ts: any, idx: number) => {
          console.log(
            `  ${idx + 1}. [${ts.intentId}] Use ${ts.toolName} on ${ts.serverName || "Server"}`,
          );
        });

        const confirmResult: any = await prompt({
          type: "confirm",
          name: "confirm",
          message: "Does this plan look correct?",
        });

        if (!confirmResult.confirm) {
          console.log("Creation cancelled. You can try refining your query.");
          return;
        }

        // 4. Map to InTorch Workflow Format
        const workflow: Workflow = {
          name: "NewWorkflow",
          version: "1.0.0",
          requirements: {
            servers: Array.from(
              new Set(
                plan.toolSelections
                  .map((ts: any) => ts.serverName)
                  .filter(Boolean),
              ),
            ) as string[],
          },
          inputs: plan.parsedIntents.map((pi: any) => ({
            id: pi.id,
            type: "string",
            description: pi.description,
            required: true,
          })),
          steps: plan.toolSelections.map((ts: any) => ({
            id: ts.intentId,
            serverName: ts.serverName || "unknown",
            toolName: ts.toolName,
            parameters: ts.mappedParameters,
          })),
        };

        // 5. Finalize metadata
        const metadata: any = await prompt([
          {
            type: "input",
            name: "name",
            message: "Workflow name (no spaces):",
            initial: "my-workflow",
          },
          {
            type: "input",
            name: "description",
            message: "Description:",
            initial: query,
          },
        ]);

        workflow.name = metadata.name;
        workflow.description = metadata.description;

        // 6. Save
        const manager = getWorkflowManager();
        const path = await manager.save(workflow);
        console.log(`\nSuccess! Workflow "${workflow.name}" saved to ${path}`);
        console.log(
          `Run it anytime with: ${PROGRAM_NAME} workflow run ${workflow.name}`,
        );
      } catch (error: any) {
        console.error("Error during workflow creation:", error.message);
      }
    });

  // workflow edit (Interactive)
  command
    .command("edit")
    .description("Interactively edit a stored workflow")
    .argument("[name]", "Workflow name")
    .action(async (name: string) => {
      try {
        const manager = getWorkflowManager();
        let workflowName = name;

        if (!workflowName) {
          const workflows = await manager.list();
          if (workflows.length === 0) {
            console.log("No workflows found to edit.");
            return;
          }
          const selectResult: any = await prompt({
            type: "select",
            name: "workflow",
            message: "Select a workflow to edit:",
            choices: workflows,
          });
          workflowName = selectResult.workflow;
        }

        const workflow = await manager.load(workflowName);
        console.log(
          `Editing workflow: ${workflow.name} (v${workflow.version})`,
        );

        while (true) {
          const stepChoices = workflow.steps.map((s) => ({
            name: s.id,
            message: `${s.id} (${s.toolName} on ${s.serverName})`,
          }));
          stepChoices.push({ name: "save_exit", message: "Save and Exit" });
          stepChoices.push({ name: "cancel", message: "Cancel" });

          const stepResult: any = await prompt({
            type: "select",
            name: "step",
            message: "Select a step to modify:",
            choices: stepChoices,
          });

          const stepId = stepResult.step;
          if (stepId === "cancel") return;
          if (stepId === "save_exit") {
            await manager.save(workflow);
            console.log(`Workflow "${workflow.name}" updated successfully.`);
            return;
          }

          const step = workflow.steps.find((s) => s.id === stepId)!;

          const actionResult: any = await prompt({
            type: "select",
            name: "action",
            message: `What would you like to edit in step "${stepId}"?`,
            choices: [
              { name: "args", message: "Arguments (args)" },
              { name: "retry", message: "Retry Policy" },
              { name: "if", message: "Condition (if)" },
              { name: "back", message: "Back" },
            ],
          });

          const action = actionResult.action;
          if (action === "back") continue;

          if (action === "args") {
            console.log(
              "\nCurrent parameters:",
              JSON.stringify(step.parameters, null, 2),
            );
            const paramsResult: any = await prompt({
              type: "input",
              name: "newParameters",
              message: "Enter new parameters in JSON format:",
              initial: JSON.stringify(step.parameters),
            });
            try {
              step.parameters = JSON.parse(paramsResult.newParameters);
              console.log("Parameters updated.");
            } catch (e) {
              console.error("Invalid JSON format. Changes not applied.");
            }
          } else if (action === "retry") {
            const currentRetry = step.retry || {
              maxAttempts: 1,
              delayMs: 1000,
            };
            const retryResult: any = await prompt([
              {
                type: "numeral",
                name: "maxAttempts",
                message: "Max attempts:",
                initial: currentRetry.maxAttempts,
              },
              {
                type: "numeral",
                name: "delayMs",
                message: "Delay between retries (ms):",
                initial: currentRetry.delayMs,
              },
            ]);
            step.retry = {
              maxAttempts: retryResult.maxAttempts,
              delayMs: retryResult.delayMs,
            };
            console.log("Retry policy updated.");
          } else if (action === "if") {
            const conditionResult: any = await prompt({
              type: "input",
              name: "newCondition",
              message: "Enter execution condition (Jexl expression):",
              initial: step.if || "",
            });
            step.if = conditionResult.newCondition || undefined;
            console.log("Condition updated.");
          }
        }
      } catch (error: any) {
        console.error("Error editing workflow:", error.message);
      }
    });

  // workflow list
  command
    .command("list")
    .description("List all stored workflows")
    .action(async () => {
      try {
        const manager = getWorkflowManager();
        const list = await manager.list();
        if (list.length === 0) {
          console.log("No workflows found.");
          return;
        }
        console.log("Available Workflows:");
        list.forEach((name) => console.log(` - ${name}`));
      } catch (error: any) {
        console.error("Error listing workflows:", error.message);
      }
    });

  // workflow save
  command
    .command("save")
    .description("Save a workflow from a JSON file")
    .argument("<file>", "Path to JSON workflow file")
    .option("--name <name>", "Override workflow name")
    .action(async (file: string, options: any) => {
      try {
        const data = await fs.readFile(file, "utf-8");
        const workflow: Workflow = JSON.parse(data);
        if (options.name) {
          workflow.name = options.name;
        }
        const manager = getWorkflowManager();
        const savedPath = await manager.save(workflow);
        console.log(`Workflow "${workflow.name}" saved to ${savedPath}`);
      } catch (error: any) {
        console.error("Error saving workflow:", error.message);
      }
    });

  // workflow run
  command
    .command("run")
    .description("Execute a workflow by name or file")
    .argument("<identifier>", "Workflow name or JSON file path")
    .option("-p, --params <json>", "Parameters in JSON format", "{}")
    .action(async (identifier: string, options: any) => {
      try {
        let workflow: Workflow;
        const manager = getWorkflowManager();

        // 1. Load workflow
        if (identifier.endsWith(".json")) {
          const data = await fs.readFile(identifier, "utf-8");
          workflow = JSON.parse(data);
        } else if (await manager.exists(identifier)) {
          workflow = await manager.load(identifier);
        } else {
          console.error(`Workflow not found: ${identifier}`);
          return;
        }

        // 2. Parse params
        let params = {};
        try {
          params = JSON.parse(options.params);
        } catch (e) {
          console.error("Invalid JSON params");
          return;
        }

        // 3. Execute
        console.log(
          `Executing workflow: "${workflow.name}" (v${workflow.version})`,
        );
        const engine = new WorkflowEngine();
        const results = await engine.execute(workflow, params);

        console.log("\nWorkflow executed successfully!");
        console.log("\nResults:");
        console.log(JSON.stringify(results, null, 2));
      } catch (error: any) {
        console.error("Workflow execution failed:", error.message);
      }
    });

  // workflow delete
  command
    .command("delete")
    .description("Delete a stored workflow")
    .argument("<name>", "Workflow name")
    .action(async (name: string) => {
      try {
        const manager = getWorkflowManager();
        if (await manager.exists(name)) {
          await manager.delete(name);
          console.log(`Workflow "${name}" deleted.`);
        } else {
          console.log(`Workflow "${name}" not found.`);
        }
      } catch (error: any) {
        console.error("Error deleting workflow:", error.message);
      }
    });

  return command;
}

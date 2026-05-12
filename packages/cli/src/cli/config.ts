import { Command } from "commander";
import { getConfigService } from "@intentorch/core";
import { AIProviders, RegistrySources } from "@intentorch/core";
import type { AIProvider } from "@intentorch/core";

function validateRegistrySource(value: string): boolean {
  const validSources = Object.values(RegistrySources);
  if (!validSources.includes(value as any)) {
    console.error(`✗ Invalid registry source: ${value}`);
    console.log(`Valid sources: ${validSources.join(", ")}`);
    return false;
  }
  return true;
}

export function configCommand(): Command {
  const command = new Command("config")
    .description("Manage AI and Registry configuration")
    .configureHelp({ showGlobalOptions: true });

  command
    .command("set <key> <value>")
    .description("Set configuration item")
    .action(async (key: string, value: string) => {
      const configService = getConfigService();

      switch (key) {
        case "provider":
          // Validate AI provider
          const validProviders = Object.values(AIProviders);
          if (!validProviders.includes(value as AIProvider)) {
            console.error(`✗ Invalid AI provider: ${value}`);
            console.log(`Valid providers: ${validProviders.join(", ")}`);
            process.exit(1);
          }
          await configService.setAIProvider(value as AIProvider);
          console.log(`✓ AI provider set to: ${value}`);
          break;
        case "apiKey":
          await configService.setAIAPIKey(value);
          console.log("✓ API key set");
          break;
        case "model":
          await configService.setAIModel(value);
          console.log(`✓ AI model set to: ${value}`);
          break;
        case "apiEndpoint":
          await configService.setAIEndpoint(value);
          console.log(`✓ API endpoint set to: ${value}`);
          break;
        case "registry.default":
          if (!validateRegistrySource(value)) process.exit(1);
          await configService.setRegistryDefault(value);
          console.log(`✓ Default registry set to: ${value}`);
          break;
        case "registry.fallback":
          if (!validateRegistrySource(value)) process.exit(1);
          await configService.setRegistryFallback(value);
          console.log(`✓ Fallback registry set to: ${value}`);
          break;
        case "services.auto-start":
          // Parse comma-separated list of servers
          const servers = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await configService.setServicesAutoStart(servers);
          console.log(`✓ Auto-start servers set to: ${servers.join(", ")}`);
          console.log(
            `  Note: These servers will auto-start when daemon starts`,
          );
          break;
        default:
          console.error(`✗ Unknown config key: ${key}`);
          console.log(
            "Available keys: provider, apiKey, model, registry.default, registry.fallback, services.auto-start",
          );
          process.exit(1);
      }
    });

  command
    .command("list")
    .description("List all configurations")
    .action(async () => {
      const configService = getConfigService();
      const config = await configService.getAppConfig();

      console.log("AI Configuration:");
      console.log(`  Provider: ${config.ai.provider || "(not set)"}`);
      console.log(
        `  API Key: ${config.ai.apiKey ? "***" + config.ai.apiKey.slice(-4) : "(not set)"}`,
      );
      console.log(`  Model: ${config.ai.model || "(not set)"}`);
      console.log(`  API Endpoint: ${config.ai.apiEndpoint || "(not set)"}`);

      console.log("\nRegistry Configuration:");
      console.log(`  Default: ${config.registry.default}`);
      console.log(`  Fallback: ${config.registry.fallback}`);

      console.log("\nServices Configuration:");
      console.log(
        `  Auto-start servers: ${config.services.autoStart.length > 0 ? config.services.autoStart.join(", ") : "(none)"}`,
      );
    });

  return command;
}

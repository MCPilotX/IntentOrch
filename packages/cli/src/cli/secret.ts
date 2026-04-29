import { Command } from "commander";
import { getSecretManager } from "@intentorch/core";

export function secretCommand(): Command {
  const command = new Command("secret")
    .description(
      "Manage sensitive environment variables (secure encrypted storage)",
    )
    .configureHelp({ showGlobalOptions: true });

  command
    .command("set <key> <value>")
    .description("Set a secret")
    .action(async (key: string, value: string) => {
      const secretManager = getSecretManager();
      await secretManager.set(key, value);
      console.log(`✓ Secret "${key}" set`);
    });

  command
    .command("list")
    .description("List all secret names")
    .action(async () => {
      const secretManager = getSecretManager();
      const secrets = await secretManager.list();

      if (secrets.length === 0) {
        console.log("No secrets stored");
        return;
      }

      console.log("Stored secrets:");
      secrets.forEach((key) => {
        console.log(`  ${key}`);
      });
    });

  command
    .command("get <key>")
    .description("Get a secret value (shows first 4 characters)")
    .action(async (key: string) => {
      const secretManager = getSecretManager();
      const value = await secretManager.get(key);

      if (value === undefined) {
        console.error(`✗ Secret "${key}" not found`);
        process.exit(1);
      }

      // Only show first 4 characters, mask the rest with *
      const masked =
        value.length <= 4
          ? "*".repeat(value.length)
          : value.slice(0, 4) + "*".repeat(value.length - 4);

      console.log(`${key}=${masked}`);
    });

  command
    .command("remove <key>")
    .description("Remove a secret")
    .action(async (key: string) => {
      const secretManager = getSecretManager();

      if (!(await secretManager.has(key))) {
        console.error(`✗ Secret "${key}" not found`);
        process.exit(1);
      }

      await secretManager.remove(key);
      console.log(`✓ Secret "${key}" removed`);
    });

  return command;
}

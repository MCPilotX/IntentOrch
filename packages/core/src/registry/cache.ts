import fs from "fs/promises";
import path from "path";
import os from "os";
import { Manifest } from "./types.js";
import { getManifestCachePath, ensureInTorchDir } from "../utils/paths.js";

export class ManifestCache {
  async get(serverName: string): Promise<Manifest | null> {
    try {
      const cachePath = getManifestCachePath(serverName);
      const data = await fs.readFile(cachePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  async set(serverName: string, manifest: Manifest): Promise<void> {
    ensureInTorchDir();
    const cachePath = getManifestCachePath(serverName);
    await fs.writeFile(cachePath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  async has(serverName: string): Promise<boolean> {
    try {
      const cachePath = getManifestCachePath(serverName);
      await fs.access(cachePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  async remove(serverName: string): Promise<void> {
    try {
      const cachePath = getManifestCachePath(serverName);
      await fs.unlink(cachePath);
    } catch (err) {
      // Ignore when file doesn't exist
    }
  }

  async clear(): Promise<void> {
    try {
      const cacheDir = path.join(
        os.homedir(),
        ".intorch",
        "cache",
        "manifests",
      );
      const files = await fs.readdir(cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(cacheDir, file));
      }
    } catch (err) {
      // Ignore when directory doesn't exist
    }
  }

  async list(): Promise<string[]> {
    try {
      const cacheDir = path.join(
        os.homedir(),
        ".intorch",
        "cache",
        "manifests",
      );
      const files = await fs.readdir(cacheDir);
      // Remove .json extension from filenames
      return files
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
          const safeName = file.replace(".json", "");
          // Convert back to a more readable format
          // Replace common patterns: _at_ -> @, _slash_ -> /, _dash_ -> -
          let name = safeName
            .replace(/_at_/g, "@")
            .replace(/_slash_/g, "/")
            .replace(/_dash_/g, "-")
            .replace(/_dot_/g, ".");

          // For backward compatibility, also handle simple underscores
          if (
            !name.includes("@") &&
            !name.includes("/") &&
            !name.includes("-")
          ) {
            // If no special characters were encoded, assume underscores were original separators
            name = name.replace(/_/g, "/");
          }

          return name;
        });
    } catch (err) {
      // Return empty array when directory doesn't exist
      return [];
    }
  }
}

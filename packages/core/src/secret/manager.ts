import fs from "fs/promises";
import fsSync from "fs";
import crypto from "crypto";
import os from "os";
import { getSecretsPath, ensureInTorchDir } from "../utils/paths.js";
import { SecretStore } from "./types.js";
import { createSingleton } from "../utils/singleton.js";
import { DatabaseManager, getSecretRepository } from "../utils/sqlite.js";
import { logger } from "../core/logger.js";

export class SecretManager {
  private secrets: Map<string, string> = new Map();
  private key: Buffer;
  private secretsPath: string;
  private _initialized = false;

  constructor() {
    this.secretsPath = getSecretsPath();
    // Improved key derivation using user-specific information
    const userSeed = os.userInfo().username + os.homedir();
    const salt = crypto.createHash("sha256").update(userSeed).digest("hex");
    
    // Security Fix: Do not use hardcoded master password.
    // Use environment variable INTORCH_MASTER_KEY if provided,
    // otherwise fallback to a machine-unique seed (less secure than env var, but better than hardcoded).
    const masterPassword = process.env.INTORCH_MASTER_KEY || "intorch-machine-locked-v1-" + userSeed;
    
    this.key = crypto.pbkdf2Sync(
      masterPassword,
      salt,
      100000,
      32,
      "sha256",
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (this._initialized) return;
    await DatabaseManager.getInstance().initialize();
    await this.migrateLegacySecrets();
    await this.loadAllToCache();
    this._initialized = true;
  }

  private async migrateLegacySecrets(): Promise<void> {
    try {
      if (fsSync.existsSync(this.secretsPath)) {
        const encrypted = await fs.readFile(this.secretsPath);
        const iv = encrypted.slice(0, 12);
        const authTag = encrypted.slice(-16);
        const encryptedData = encrypted.slice(12, -16);

        const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
          decipher.update(encryptedData),
          decipher.final(),
        ]);
        const json = decrypted.toString();
        const obj: SecretStore = JSON.parse(json);

        const repo = getSecretRepository();
        for (const [key, value] of Object.entries(obj)) {
          // Encrypt individually for SQLite
          const individualIv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv("aes-256-gcm", this.key, individualIv);
          const individualEncrypted = Buffer.concat([
            cipher.update(String(value), "utf8"),
            cipher.final(),
          ]);
          const individualAuthTag = cipher.getAuthTag();
          
          await repo.set(key, individualEncrypted, individualIv, individualAuthTag);
        }

        await fs.rename(this.secretsPath, this.secretsPath + ".bak");
        logger.info("[SecretManager] Migrated legacy secrets to SQLite");
      }
    } catch (err) {
      // Ignore when file doesn't exist or decryption fails
      logger.warn(`[SecretManager] Legacy secret migration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async loadAllToCache(): Promise<void> {
    const repo = getSecretRepository();
    const keys = await repo.list();
    this.secrets.clear();

    for (const key of keys) {
      const data = await repo.get(key);
      if (data) {
        try {
          const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, data.iv);
          decipher.setAuthTag(data.authTag);
          const decrypted = Buffer.concat([
            decipher.update(data.encryptedValue),
            decipher.final(),
          ]);
          this.secrets.set(key, decrypted.toString());
        } catch (e) {
          logger.error(`[SecretManager] Failed to decrypt secret '${key}': ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  async load(): Promise<void> {
    await this.ensureInitialized();
  }

  async get(key: string): Promise<string | undefined> {
    await this.ensureInitialized();
    return this.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    
    // Encrypt for SQLite
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(String(value), "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const repo = getSecretRepository();
    await repo.set(key, encrypted, iv, authTag);
    
    // Update cache
    this.secrets.set(key, value);
  }

  async list(): Promise<string[]> {
    await this.ensureInitialized();
    return Array.from(this.secrets.keys());
  }

  async remove(key: string): Promise<void> {
    await this.ensureInitialized();
    const repo = getSecretRepository();
    await repo.delete(key);
    this.secrets.delete(key);
  }

  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.secrets.has(key);
  }

  async getAll(): Promise<Map<string, string>> {
    await this.ensureInitialized();
    return new Map(this.secrets);
  }
}

// Singleton instance — uses ESM-safe singleton factory
export const getSecretManager = createSingleton<SecretManager>(
  "core:secret-manager",
  () => new SecretManager(),
);

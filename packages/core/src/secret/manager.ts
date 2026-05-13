import fs from "fs/promises";
import crypto from "crypto";
import os from "os";
import { getSecretsPath, ensureInTorchDir } from "../utils/paths.js";
import { SecretStore } from "./types.js";

import { FSLock } from "../utils/fs-lock.js";

export class SecretManager {
  private secrets: Map<string, string> = new Map();
  private key: Buffer;
  private secretsPath: string;
  private lastModifiedTime: number = 0;

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

  async loadSecretsIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.secretsPath).catch(() => null);
      if (!stats) {
        // File doesn't exist, clear secrets
        this.secrets.clear();
        this.lastModifiedTime = 0;
        return;
      }

      // Check if file has been modified since last load
      if (stats.mtimeMs <= this.lastModifiedTime) {
        return; // File hasn't changed, no need to reload
      }

      ensureInTorchDir();
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

      // Update secrets map
      this.secrets.clear();
      for (const [k, v] of Object.entries(obj)) {
        this.secrets.set(k, v);
      }

      this.lastModifiedTime = stats.mtimeMs;
    } catch (err) {
      // Ignore when file doesn't exist or decryption fails
      this.secrets.clear();
      this.lastModifiedTime = 0;
    }
  }

  async load(): Promise<void> {
    await this.loadSecretsIfNeeded();
  }

  async save(): Promise<void> {
    const lockPath = this.secretsPath + ".lock";
    const acquired = await FSLock.acquire(lockPath);
    
    if (!acquired) {
      throw new Error("Secret storage is locked by another process.");
    }

    try {
      ensureInTorchDir();

      const obj: SecretStore = Object.fromEntries(this.secrets);
      const json = JSON.stringify(obj);

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);

      const encrypted = Buffer.concat([
        cipher.update(json, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const result = Buffer.concat([iv, encrypted, authTag]);
      await fs.writeFile(this.secretsPath, result);
    } catch (err: unknown) {
      throw err;
    } finally {
      await FSLock.release(lockPath);
    }
  }

  async get(key: string): Promise<string | undefined> {
    await this.loadSecretsIfNeeded();
    return this.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.loadSecretsIfNeeded();
    this.secrets.set(key, value);
    await this.save();
  }

  async list(): Promise<string[]> {
    await this.loadSecretsIfNeeded();
    return Array.from(this.secrets.keys());
  }

  async remove(key: string): Promise<void> {
    await this.loadSecretsIfNeeded();
    this.secrets.delete(key);
    await this.save();
  }

  async has(key: string): Promise<boolean> {
    await this.loadSecretsIfNeeded();
    return this.secrets.has(key);
  }

  async getAll(): Promise<Map<string, string>> {
    await this.loadSecretsIfNeeded();
    return new Map(this.secrets);
  }
}

// Singleton instance
let secretManager: SecretManager | null = null;

export function getSecretManager(): SecretManager {
  if (!secretManager) {
    secretManager = new SecretManager();
  }
  return secretManager;
}

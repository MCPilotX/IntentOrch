/**
 * Lightweight manifest format for MCP servers
 * Contains only startup information, tools are discovered dynamically
 */

export interface LightweightManifest {
  /** Server name */
  name: string;

  /** Server version */
  version: string;

  /** Runtime configuration */
  runtime: {
    /** Runtime type (node, python, etc.) */
    type: string;

    /** Command to start the server */
    command: string;

    /** Command arguments */
    args?: string[];

    /** Working directory */
    cwd?: string;

    /** Required environment variables */
    env?: string[];
  };

  /** Optional: metadata for display purposes */
  metadata?: {
    description?: string;
    author?: string;
    repository?: string;
    license?: string;
  };

  /** Optional: compatibility flags */
  compatibility?: {
    /** Whether this server supports dynamic tool discovery */
    supportsDynamicDiscovery?: boolean;

    /** Minimum MCP protocol version required */
    minMCPVersion?: string;
  };
}

/**
 * Check if a manifest is lightweight (doesn't contain tools)
 */
export function isLightweightManifest(
  manifest: unknown,
): manifest is LightweightManifest {
  const m = manifest as Record<string, unknown> | null;
  return (
    m !== null &&
    typeof m === "object" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    m.runtime !== null &&
    typeof m.runtime === "object" &&
    typeof (m.runtime as Record<string, unknown>).type === "string" &&
    typeof (m.runtime as Record<string, unknown>).command === "string" &&
    // Lightweight manifests should not have tools array
    !m.tools &&
    !((m.capabilities as Record<string, unknown>)?.tools)
  );
}

/**
 * Convert full manifest to lightweight manifest.
 * Accepts a partial manifest shape — callers are responsible for ensuring
 * that `name`, `version`, and `runtime` are present.
 */
export function toLightweightManifest(fullManifest: {
  name: string;
  version: string;
  runtime: { type: string; command: string; args?: string[]; cwd?: string; env?: string[] };
  metadata?: { description?: string; author?: string; repository?: string; license?: string };
  compatibility?: { supportsDynamicDiscovery?: boolean; minMCPVersion?: string };
  transport?: { type: string; url?: string; headers?: Record<string, string> };
}): LightweightManifest {
  const manifest: LightweightManifest = {
    name: fullManifest.name,
    version: fullManifest.version,
    runtime: {
      type: fullManifest.runtime.type,
      command: fullManifest.runtime.command,
      args: fullManifest.runtime.args,
      cwd: fullManifest.runtime.cwd,
      env: fullManifest.runtime.env,
    },
    metadata: fullManifest.metadata,
    compatibility: {
      supportsDynamicDiscovery: true,
      minMCPVersion: fullManifest.compatibility?.minMCPVersion || "1.0.0",
    },
  };

  // Preserve transport configuration (important for SSE/HTTP services)
  if (fullManifest.transport) {
    (manifest as LightweightManifest & { transport: unknown }).transport = fullManifest.transport;
  }

  return manifest;
}

/**
 * Check if server supports dynamic tool discovery.
 * Accepts a partial manifest shape with optional tools/capabilities fields.
 */
export function supportsDynamicDiscovery(manifest: {
  compatibility?: { supportsDynamicDiscovery?: boolean };
  tools?: unknown[];
  capabilities?: { tools?: unknown[] };
}): boolean {
  return (
    manifest.compatibility?.supportsDynamicDiscovery !== false &&
    (!manifest.tools || manifest.tools.length === 0) &&
    (!manifest.capabilities ||
      !manifest.capabilities.tools ||
      manifest.capabilities.tools.length === 0)
  );
}

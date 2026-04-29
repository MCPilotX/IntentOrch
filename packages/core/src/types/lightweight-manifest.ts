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
  manifest: any,
): manifest is LightweightManifest {
  return (
    manifest &&
    typeof manifest === "object" &&
    typeof manifest.name === "string" &&
    typeof manifest.version === "string" &&
    manifest.runtime &&
    typeof manifest.runtime.type === "string" &&
    typeof manifest.runtime.command === "string" &&
    // Lightweight manifests should not have tools array
    !manifest.tools &&
    !(manifest.capabilities && manifest.capabilities.tools)
  );
}

/**
 * Convert full manifest to lightweight manifest
 */
export function toLightweightManifest(fullManifest: any): LightweightManifest {
  return {
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
}

/**
 * Check if server supports dynamic tool discovery
 */
export function supportsDynamicDiscovery(manifest: any): boolean {
  return (
    manifest.compatibility?.supportsDynamicDiscovery !== false &&
    (!manifest.tools || manifest.tools.length === 0) &&
    (!manifest.capabilities ||
      !manifest.capabilities.tools ||
      manifest.capabilities.tools.length === 0)
  );
}

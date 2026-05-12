import { logger } from "../core/logger.js";

/**
 * Owner/Project format unification utilities
 * Ensures consistent owner/project format throughout the system
 */

export interface OwnerProjectFormat {
  owner: string;
  project: string;
  branch?: string;
  path?: string;
  fullName: string; // owner/project
  qualifiedName: string; // owner/project[@branch][:path]
  source: string; // github, gitee, direct, local, official
}

/**
 * Build OwnerProjectFormat result from a simple owner/project string
 */
function buildResult(
  input: string,
  source: string = "github",
): OwnerProjectFormat {
  let baseName = input;
  let branch: string | undefined;
  let path: string | undefined;

  // 1. Extract path (from the end to avoid confusion with source prefix)
  const pathIndex = baseName.indexOf(":");
  if (pathIndex > -1) {
    const potentialSource = baseName.substring(0, pathIndex);
    // If it's NOT a known source, then the colon is likely a path separator
    if (!["github", "gitee", "official", "local", "direct", "remote"].includes(potentialSource)) {
       const [nameWithBranch, pathPart] = baseName.split(":", 2);
       baseName = nameWithBranch;
       path = pathPart;
    }
  }

  // 2. Extract branch
  if (baseName.includes("@")) {
    const [name, branchPart] = baseName.split("@", 2);
    baseName = name;
    branch = branchPart;
  }

  // 3. Normalize owner/project
  if (baseName.includes("/")) {
    const parts = baseName.split("/");
    const firstPart = parts[0];
    if (["github", "gitee", "official", "local", "direct", "remote"].includes(firstPart)) {
      source = firstPart === "remote" ? "direct" : firstPart;
    }
  } else {
    // Shorthand for official registry
    if (source !== "local" && source !== "direct") {
      baseName = `official/${baseName}`;
      source = "official";
    }
  }

  const [owner, project] = baseName.split("/", 2);

  let qualifiedName = `${owner}/${project}`;
  if (branch) {
    qualifiedName += `@${branch}`;
  }
  if (path) {
    qualifiedName += `:${path}`;
  }

  return {
    owner,
    project,
    branch,
    path,
    fullName: `${owner}/${project}`,
    qualifiedName,
    source,
  };
}

/**
 * Convert various server name formats to unified owner/project format
 */
export function toOwnerProjectFormat(serverName: string): OwnerProjectFormat {
  if (!serverName) throw new Error("Server name cannot be empty");
  
  const trimmedName = serverName.trim();

  // 0. Handle source:rest format
  if (trimmedName.includes(":")) {
    const firstColonIndex = trimmedName.indexOf(":");
    const source = trimmedName.substring(0, firstColonIndex);
    const rest = trimmedName.substring(firstColonIndex + 1);

    if (["github", "gitee", "official", "local", "direct", "remote"].includes(source)) {
      // If rest is a URL, process it as a URL
      if (rest.startsWith("http://") || rest.startsWith("https://") || rest.startsWith("file://")) {
        return toOwnerProjectFormat(rest);
      }
      return buildResult(rest, source);
    }
  }

  // 1. Handle URL format
  if (
    trimmedName.startsWith("http://") ||
    trimmedName.startsWith("https://") ||
    trimmedName.startsWith("file://")
  ) {
    try {
      const url = new URL(trimmedName);

      if (trimmedName.startsWith("file://")) {
        const fileName = url.pathname.split("/").filter(Boolean).pop() || "local-service";
        const baseName = fileName.replace(/\.json$/i, "");
        return buildResult(`local/${baseName}`, "local");
      }

      const pathname = url.pathname;
      let servicePath = pathname.endsWith("/mcp.json") 
        ? pathname.slice(0, -9) 
        : (pathname.endsWith(".json") ? pathname.slice(0, -5) : pathname);

      if (url.hostname.includes("github.com")) {
        const githubHubMatch = servicePath.match(/\/[^\/]+\/mcp-server-hub\/(?:[^\/]+\/)*github\/(.+)/);
        if (githubHubMatch) return buildResult(githubHubMatch[1], "github");
        
        const segments = servicePath.split("/").filter(Boolean);
        if (segments.length >= 2) return buildResult(`${segments[0]}/${segments[1]}`, "github");
      }

      if (url.hostname.includes("gitee.com")) {
        const giteeHubMatch = servicePath.match(/^\/mcpilotx\/mcp-server-hub\/raw\/master\/(.+)$/);
        if (giteeHubMatch) return buildResult(giteeHubMatch[1], "gitee");
        
        const segments = servicePath.split("/").filter(Boolean);
        if (segments.length >= 2) return buildResult(`${segments[0]}/${segments[1]}`, "gitee");
      }

      const hostname = url.hostname.replace(/\./g, "-");
      const segments = servicePath.split("/").filter(Boolean);
      const lastSegment = segments.pop() || "service";
      return buildResult(`remote/${hostname}-${lastSegment}`, "direct");
    } catch (error) {
      // Fall through
    }
  }

  // 2. Local path
  if (trimmedName.startsWith("./") || trimmedName.startsWith("/") || trimmedName.endsWith(".json")) {
    const fileName = trimmedName.split("/").filter(Boolean).pop() || "local-service";
    const baseName = fileName.replace(/\.json$/i, "");
    return buildResult(`local/${baseName}`, "local");
  }

  // 3. Shorthands
  if (trimmedName.startsWith("official/")) return buildResult(trimmedName, "official");
  if (!trimmedName.includes("/")) return buildResult(`official/${trimmedName}`, "official");

  return buildResult(trimmedName, "github");
}

/**
 * Convert server name to a stable URN (Uniform Resource Name)
 * Format: source:owner/project[@branch][:path]
 */
export function toUrn(serverName: string): string {
  const format = toOwnerProjectFormat(serverName);
  let urn = `${format.source}:${format.fullName}`;
  if (format.branch) urn += `@${format.branch}`;
  if (format.path) urn += `:${format.path}`;
  return urn;
}

/**
 * Convert URN to a display string
 */
export function toDisplayString(serverName: string): string {
  const format = toOwnerProjectFormat(serverName);
  return format.qualifiedName;
}

/**
 * Convert URN to a storage format (safe for filenames)
 */
export function toStorageFormat(serverName: string): string {
  const urn = toUrn(serverName);
  return urn
    .replace(/[^a-zA-Z0-9_\-@:./]/g, "_")
    .replace(/:/g, "_") // Replace colon for NTFS compatibility
    .replace(/\//g, "-") // Replace slash
    .replace(/-+/g, "-")
    .replace(/_+/g, "_");
}

/**
 * Check if two names refer to the same service
 */
export function isSameService(name1: string, name2: string): boolean {
  const u1 = toUrn(name1);
  const u2 = toUrn(name2);
  // Compare without branch/path for basic "same service" check
  const f1 = toOwnerProjectFormat(u1);
  const f2 = toOwnerProjectFormat(u2);
  return f1.source === f2.source && f1.fullName === f2.fullName;
}

export function getFriendlyName(serverName: string): string {
  const format = toOwnerProjectFormat(serverName);
  let name = format.project;
  const suffixes = ["-mcp", "-server", "-service", "-tool"];
  for (const s of suffixes) {
    if (name.endsWith(s)) {
      name = name.slice(0, -s.length);
      break;
    }
  }
  return name;
}

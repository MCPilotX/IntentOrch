/**
 * ESM-safe Singleton Factory
 *
 * Standard ESM singleton patterns using module-level `let instance = null`
 * (lazy initialization) are vulnerable in ESM because two modules may
 * simultaneously evaluate the getter function before either assignment
 * completes. Since JavaScript is single-threaded, true concurrent access
 * within the same synchronous execution context is impossible — but ESM
 * module resolution can interleave with top-level `await`, causing a
 * module-level `let` variable to still be `null` when a second caller
 * checks it after an `await` in the first caller's initialization.
 *
 * This factory stores the singleton reference in `globalThis`, which
 * survives across all module evaluations and ensures that only one
 * instance is ever created per key.
 *
 * Usage:
 * ```ts
 * // Before (unsafe in ESM with async init):
 * let instance: MyClass | null = null;
 * export function getMyClass(): MyClass {
 *   if (!instance) instance = new MyClass();
 *   return instance;
 * }
 *
 * // After (safe):
 * export const getMyClass = createSingleton<MyClass>("my-class", () => new MyClass());
 * ```
 */

const STORE_KEY = "__singleton_store";

function getStore(): Map<string, unknown> {
  const g = globalThis as Record<string, unknown>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map<string, unknown>();
  }
  return g[STORE_KEY] as Map<string, unknown>;
}

/**
 * Create an ESM-safe singleton getter function.
 *
 * The getter stores the instance reference in `globalThis` rather than a
 * module-level `let` variable. This eliminates the ESM race condition
 * where two modules evaluate the getter before either saves the instance
 * back to the module-scoped variable.
 *
 * @param key - Unique identifier (use a namespaced string like "core:secret-manager")
 * @param factory - Factory function that creates the instance (called at most once)
 * @returns A getter that always returns the same instance
 */
export function createSingleton<T>(
  key: string,
  factory: () => T,
): () => T {
  return (): T => {
    const store = getStore();
    if (store.has(key)) {
      return store.get(key) as T;
    }
    const instance = factory();
    store.set(key, instance);
    return instance;
  };
}



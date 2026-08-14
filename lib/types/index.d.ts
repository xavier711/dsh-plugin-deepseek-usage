/**
 * dsh-deepseek-usage — public type surface.
 *
 * The node half is a plain Cordis function plugin
 * ({ name, inject, apply }); the browser half is a hand-built client bundle
 * served by dsh-client-modules. This file only describes the plugin shape
 * for TypeScript consumers.
 * @module dsh-deepseek-usage
 */

/** Optional row config overriding the built-in defaults. */
export interface DeepseekUsageConfig {
  /** How long a fetched balance may be served from cache (ms). */
  balanceTtlMs?: number;
  /** How many most-recent sessions to replay for the local statistics. */
  maxSessions?: number;
  /** Parallel session-log inspections. */
  sessionConcurrency?: number;
  /** Approximate DeepSeek pricing, CNY per 1M tokens (cost-estimate basis). */
  pricePerMillionInput?: number;
  pricePerMillionCacheHit?: number;
  pricePerMillionOutput?: number;
  /** Timeout for the balance request (ms). */
  balanceTimeoutMs?: number;
}

/** Cordis plugin name (also the row id used in cordis.patch.yml). */
export declare const name: "deepseek-usage";
/** Host services this plugin needs. */
export declare const inject: readonly ["credentials", "sessionPersistence", "webServer"];
/** Plugin body: registers the /dsh-usage routes on the harness webserver. */
export declare function apply(ctx: unknown, config?: DeepseekUsageConfig): void;

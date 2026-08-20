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
  /** Timeout for the balance request (ms). */
  balanceTimeoutMs?: number;
  /** How long a successful local-usage payload may be served from cache (ms). */
  localTtlMs?: number;
  /** Per-model pricing, CNY per 1M tokens (see DEFAULTS in lib/index.js). */
  pricing?: Record<string, unknown>;
  /** Epoch ms when the V4 peak/off-peak pricing takes effect (2026-08-17 00:00 Beijing). */
  newPricingAt?: number;
  /** Beijing peak windows, local hours [start, end). */
  peakHours?: Array<[number, number]>;
  /** Beijing timezone offset for the peak-window determination (minutes). */
  timezoneOffsetMinutes?: number;
  /** Update-check URL (raw package.json on the repo's default branch). */
  updateCheckUrl?: string;
  /** Releases page shown in the update banner. */
  updateReleasesUrl?: string;
  /** How long a successful update check may be cached (ms). */
  updateCheckTtlMs?: number;
}

/** Cordis plugin name (also the row id used in cordis.patch.yml). */
export declare const name: "deepseek-usage";
/** Host services this plugin needs. */
export declare const inject: readonly ["credentials", "sessionPersistence", "webServer"];
/** Plugin body: registers the /dsh-usage routes on the harness webserver. */
export declare function apply(ctx: unknown, config?: DeepseekUsageConfig): void;

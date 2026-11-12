import type { LocalApi } from "../cms/api/local-api.ts";
import type { ImportCounts, ImportMode } from "../transfer/format.ts";

/** Where `afterError` saw an error. */
export type ErrorSource = "request" | "job" | "seed" | "init";

/** What `afterError` gets. */
export type ErrorContext = {
  error: unknown;
  source: ErrorSource;
  /** The request of an unexpected error in a route (`source: "request"`). */
  request?: Request;
  /** The job of a failed attempt (`source: "job"`). */
  job?: { id: string; task: string; attempts: number; maxAttempts: number };
  /** The server local API. Access rules are skipped. */
  cms: LocalApi;
};

/**
 * Hooks of the CMS itself, on `defineCms()` options and on plugins. Plugins run in the order of `plugins`, then the
 * host. Each gets the server local API as `cms`, which skips the access rules. Start order per database: migrations,
 * `seed`, `onInit`, then requests.
 */
export type LifecycleHooks = {
  /**
   * Runs once per database. The host's seed runs only on a database without documents and globals; a plugin's runs
   * the first time the plugin starts on a database. All seeds of one start run in one transaction with their markers,
   * so a failed seed leaves nothing and runs again on the next start. Media files are not part of the transaction.
   * @example
   * seed: async ({ cms }) => { await cms.import(await openAsBlob("seed/tenon.zip")) }
   */
  seed?: (ctx: { cms: LocalApi }) => unknown;
  /** Runs on every start, after `seed` and before the first request. Serverless hosts start often: keep it cheap. */
  onInit?: (ctx: { cms: LocalApi }) => unknown;
  /** Runs after `cms.import()` commits. Import skips document hooks, so derived state is rebuilt here. */
  afterImport?: (ctx: { cms: LocalApi; mode: ImportMode; counts: ImportCounts }) => unknown;
  /**
   * Runs for unexpected errors: a route's 500, a failed job attempt, a failed `seed` or `onInit`. Errors that answer
   * 4xx are not reported. An error it throws is logged and dropped.
   */
  afterError?: (ctx: ErrorContext) => unknown;
};

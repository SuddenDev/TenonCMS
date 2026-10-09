import { consola } from "consola";
import { HTTPException } from "hono/http-exception";
import type { Json } from "../index.d.ts";
import type { Loader } from "../describe/registration-checks.ts";
import { toJson } from "./to-json.ts";

/**
 * Runs a loader and checks that it returned JSON. An error the loader throws passes through, so the HTTP error
 * handler maps it. A result that is not JSON is a bug in the host: it is logged with the registration's source and
 * answered with a generic 500.
 * @param what Names the registration in the log, e.g. `admin page "stats"`.
 * @returns A copy of the result.
 */
export async function runLoader<C>(loader: Loader<C>, ctx: C, what: string): Promise<Json> {
  const result = await loader.load(ctx);
  try {
    return toJson(result, "result");
  } catch (e) {
    consola.withTag("integral").error(`${what} in ${loader.source}: ${(e as Error).message}`);
    throw new HTTPException(500, { message: "Internal Server Error" });
  }
}

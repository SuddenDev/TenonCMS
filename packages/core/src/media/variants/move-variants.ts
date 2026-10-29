import { consola } from "consola";
import type { Storage } from "../storage/types.ts";
import { variantKey, variantsOf } from "./keys.ts";

const log = consola.withTag("tenon");

/** Moves a file and its variants. A variant that fails to move is logged; it renders again on request. */
export async function moveWithVariants(storage: Storage, from: string, to: string) {
  await storage.move(from, to);
  await moveVariants(storage, from, to);
}

/** Moves variants without moving the original file. Variant failures are logged. */
export async function moveVariants(storage: Storage, from: string, to: string) {
  await Promise.all(
    (await variantsOf(storage, from)).map((id) =>
      storage.move(variantKey(from, id), variantKey(to, id)).catch((e) => log.error(e)),
    ),
  );
}

import { consola } from "consola";
import type { Storage } from "../storage/types.ts";
import { variantKey, variantsOf } from "./keys.ts";

const log = consola.withTag("integral");

/** Deletes a file and its variants. A failed delete is logged. */
export async function deleteWithVariants(storage: Storage, key: string) {
  const variants = await variantsOf(storage, key).catch(() => []);
  await Promise.all(
    [key, ...variants.map((id) => variantKey(key, id))].map((k) =>
      storage.delete(k).catch((e) => log.error(`Deleting "${k}" failed`, e)),
    ),
  );
}

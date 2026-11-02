import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { preview } from "tenoncms/preview";
import { loadLocalization } from "./composables.ts";

/**
 * Loads the localization config into the payload before the first page reads, then starts the preview runtime in
 * the browser, with the admin path for the bars' links.
 */
export default defineNuxtPlugin(async () => {
  await loadLocalization();
  const { admin } = useRuntimeConfig().public.tenon as { admin: string | false };
  if (import.meta.client) preview({ admin });
});

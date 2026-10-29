import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { preview } from "tenoncms/preview";

/** Starts the preview runtime in the browser, with the admin path for the bars' links. */
export default defineNuxtPlugin(() => {
  const { admin } = useRuntimeConfig().public.tenon as { admin: string | false };
  preview({ admin });
});

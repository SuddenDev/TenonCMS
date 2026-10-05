import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { preview } from "integral-cms/preview";

/** Starts the preview runtime in the browser, with the admin path for the bars' links. */
export default defineNuxtPlugin(() => {
  const { admin } = useRuntimeConfig().public.integral as { admin: string | false };
  preview({ admin });
});

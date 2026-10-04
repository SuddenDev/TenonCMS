import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { preview } from "integral-cms/preview";

export default defineNuxtPlugin(() => {
  const { admin } = useRuntimeConfig().public.integral as { admin: string | false };
  preview({ admin });
});

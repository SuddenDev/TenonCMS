import { defineNuxtPlugin } from "#app";
import { preview } from "integral-cms/preview";

export default defineNuxtPlugin(() => {
  preview();
});

import { ref } from "vue";
import { createClient } from "../../../core/src/client";
import type { Schema } from "../../../core/src/schema";

export { SLUG_PATTERN, slugify } from "../../../core/src/helpers/slugify";
export { CmsError } from "../../../core/src/client";
export type { Perspective, Session } from "../../../core/src/client";
export type { Data, Field, Fields, MediaRead } from "../../../core/src/schema";

export const client = createClient<{ schema: Schema }>();

export const schema = ref<Schema & { media?: { regenerate: boolean }; site?: string }>({});

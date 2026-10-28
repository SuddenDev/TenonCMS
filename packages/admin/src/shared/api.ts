import type { AdminDescriptor } from "../../../core/src/admin/index.d.ts";
import { ref } from "vue";
import { createClient } from "../../../core/src/client";
import type { Schema } from "../../../core/src/schema";
import type { Role } from "../../../core/src/users/roles";

export { SLUG_PATTERN, slugify } from "../../../core/src/helpers/slugify";
export { CmsError, LOCK_TTL } from "../../../core/src/client";
export type { Lock, Perspective, Session } from "../../../core/src/client";
export type { Data, Field, Fields, Layout, MediaRead } from "../../../core/src/schema";

export const client = createClient<{ schema: Schema }>();

export const schema = ref<
  Schema & {
    media?: { regenerate: boolean };
    site?: string;
    admin?: AdminDescriptor;
    localization?: { locales: string[]; defaultLocale: string };
    roles?: Role[];
    email?: boolean;
  }
>({});

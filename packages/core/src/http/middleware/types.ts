import type { User } from "better-auth";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";

export type Env = { Variables: { cms: Cms<Schema>; user: User } };

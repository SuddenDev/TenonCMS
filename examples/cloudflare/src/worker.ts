import { handle } from "@astrojs/cloudflare/handler";
import { tenonObject } from "tenoncms/cloudflare";
import cms from "../tenon.config";

export const CmsObject = tenonObject(cms);

export default { fetch: handle } satisfies ExportedHandler<Env>;

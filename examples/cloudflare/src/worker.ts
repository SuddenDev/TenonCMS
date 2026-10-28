import { handle } from "@astrojs/cloudflare/handler";
import { integralObject } from "integral-cms/cloudflare";
import cms from "../integral.config";

export const CmsObject = integralObject(cms);

export default { fetch: handle } satisfies ExportedHandler<Env>;

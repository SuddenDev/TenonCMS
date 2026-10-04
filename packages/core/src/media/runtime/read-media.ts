import type { Core } from "../../cms/runtime/types.ts";
import type { MediaDoc } from "../../schema/index.ts";
import { decorate } from "../images/decorate.ts";
import { mediaOf } from "./create-media-core.ts";

/** A media document with `url`, and `src` / `srcset` for images, with the global image options. */
export const read = (core: Core, doc: Record<string, any>) =>
  decorate(mediaOf(core), doc) as MediaDoc & { url: string };

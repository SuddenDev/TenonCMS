import "../admin/virtual";
// Registers the host's `cms` type, so `createClient()` needs no type argument.
// `#tenon/config` MUST resolve to the host's config file. Adapters set that up; see the README otherwise.
import type cms from "#tenon/config";

declare module "tenoncms/client" {
  interface Register {
    cms: typeof cms;
  }
}

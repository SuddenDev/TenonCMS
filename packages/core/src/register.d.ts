/// <reference path="./admin/virtual.d.ts" />
// Registers the host's `cms` type, so `createClient()` needs no type argument.
// `#integral/config` MUST resolve to the host's config file. Adapters set that up; see the README otherwise.
import type cms from '#integral/config'

declare module 'integral-cms/client' {
  interface Register {
    cms: typeof cms
  }
}

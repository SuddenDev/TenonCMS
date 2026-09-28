/// <reference types="astro/client" />

// Type stubs for the runtime files in src/astro and src/nuxt/runtime. They are compiled by the
// host framework, where these modules exist. Only core's own typecheck reads this file.

// The host's config file. Framework adapters alias `#integral/config` to it.
declare module "#integral/config" {
  const cms: import("./src/index.ts").Cms<import("./src/schema.ts").Schema>;
  export default cms;
}

// The host's optional admin customization. Adapters alias `#integral/admin` to it or to a stub.
declare module "#integral/admin" {
  const options: import("./src/admin/index.d.ts").AdminOptions;
  export default options;
}

declare module "#app" {
  export * from "nuxt/app";
}

declare namespace App {
  interface Locals {
    integral: typeof import("#integral/config").default;
  }
}

/// <reference types="astro/client" />

// Type stubs for the runtime files in src/astro and src/nuxt/runtime. They are compiled by the
// host framework, where these modules exist. Only core's own typecheck reads this file.

// The host's config file. Framework adapters alias `#integral/config` to it.
declare module "#integral/config" {
  const cms: import("./src/index.ts").Cms<import("./src/schema.ts").Schema>;
  export default cms;
}

// The Workers runtime, with the binding of the CMS object.
declare module "cloudflare:workers" {
  export const env: {
    CMS: {
      getByName(
        name: string,
      ): import("./src/integrations/cloudflare/object-client.ts").DurableObjectStub;
    };
  };
}

declare module "#app" {
  export * from "nuxt/app";
}

declare namespace App {
  interface Locals {
    integral: typeof import("#integral/config").default;
  }
}

declare module "#integral/client-registry" {
  const registry: Record<string, () => Promise<unknown>>;
  export default registry;
}

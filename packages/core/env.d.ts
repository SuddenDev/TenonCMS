/// <reference types="astro/client" />

// Type stubs for the runtime files in src/astro and src/nuxt/runtime. They are compiled by the
// host framework, where these modules exist. Only core's own typecheck reads this file.

// The host's config file. Framework adapters alias `#integral/config` to it.
declare module '#integral/config' {
  export const cms: import('./src/index.ts').Cms<import('./src/schema.ts').Config>
}

declare module '#app' {
  export * from 'nuxt/app'
}

declare namespace App {
  interface Locals {
    integral: typeof import('#integral/config').cms
  }
}

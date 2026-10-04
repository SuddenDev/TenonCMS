# adapters

Framework integrations. They generate no code: each one points `#integral/config` at the host's `integral.config.ts`, mounts `/api/cms`, and serves the admin page.

| Folder   | Export               | What it does                                                                                                   |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `astro/` | `integral-cms/astro` | Injects the API route and admin page, a middleware that sets `Astro.locals.integral`, and the preview runtime. |
| `nuxt/`  | `integral-cms/nuxt`  | Adds the server handler and admin page, the preview plugin, and `useIntegral()` (`runtime/`).                  |
| `vite/`  | `integral-cms/vite`  | `integralAdmin()` for Vite frameworks without an adapter (TanStack Start). The host mounts the API itself.     |

Both adapters pass their `admin` option to the preview runtime, for the links of the preview and admin bars:
Astro writes it into the injected script, Nuxt into `runtimeConfig.public.integral.admin`, which the client plugin
reads. With `admin: false` it is `false`, so no admin bar.

Files the host compiles (`route.ts`, `middleware.ts`, `admin.astro`, `nuxt/runtime/`) ship as `.ts` source in `dist/`.

# adapters

Framework integrations. They generate no code: each one points `#integral/config` at the host's `integral.config.ts`, mounts `/api/cms`, and serves the admin page.

| Folder   | Export               | What it does                                                                                                   |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `astro/` | `integral-cms/astro` | Injects the API route and admin page, a middleware that sets `Astro.locals.integral`, and the preview runtime. |
| `nuxt/`  | `integral-cms/nuxt`  | Adds the server handler and admin page, the preview plugin, and `useIntegral()` (`runtime/`).                  |
| `vite/`  | `integral-cms/vite`  | `integralAdmin()` for Vite frameworks without an adapter (TanStack Start). The host mounts the API itself.     |

Files the host compiles (`route.ts`, `middleware.ts`, `admin.astro`, `nuxt/runtime/`) ship as `.ts` source in `dist/`.

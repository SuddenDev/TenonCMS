import type { InjectionKey, Ref } from "vue";
import type { Session } from "./api";
import type { AdminOptions, IntegralContext, Page } from "../../../core/src/admin/index.d.ts";

export const optionsKey = Symbol() as InjectionKey<AdminOptions>;
export const integralKey = Symbol() as InjectionKey<IntegralContext>;
export const sessionKey = Symbol() as InjectionKey<{
  user: Ref<Session["user"] | null>;
  signOut: () => Promise<void>;
}>;

/** Path of the content views: collections, globals, media and settings. */
export const CONTENT = "/content";

/** Path of a host page. Pages shown in the content menu or on the Settings page sit under `CONTENT`. */
export function pagePath(key: string, { route = `/${key}`, nav }: Page) {
  const display = nav?.display ?? "content";
  const prefix =
    display === "content" ? CONTENT : display === "settings" ? `${CONTENT}/settings` : "";
  return `${prefix}${route}`.replace(/(.)\/$/, "$1");
}

// The plugins' fields and pages, then the host's. A key used twice throws.
export function mergeOptions({ plugins = [], ...host }: AdminOptions): AdminOptions {
  const out: AdminOptions & Required<Pick<AdminOptions, "fields" | "pages">> = {
    ...host,
    fields: {},
    pages: {},
  };
  for (const { name, ...plugin } of [...plugins, { name: "integral.admin.ts", ...host }]) {
    for (const kind of ["fields", "pages"] as const) {
      for (const [key, value] of Object.entries(plugin[kind] ?? {})) {
        if (Object.hasOwn(out[kind], key))
          throw new Error(`integral-cms: duplicate admin ${kind} key "${key}" in ${name}`);
        out[kind][key] = value as never;
      }
    }
  }
  return out;
}

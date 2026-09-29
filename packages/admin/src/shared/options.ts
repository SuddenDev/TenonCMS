import type { InjectionKey, Ref } from "vue";
import type { Session } from "./api";
import type { AdminOptions, IntegralContext, Page } from "../../../core/src/admin/index.d.ts";

export const optionsKey = Symbol() as InjectionKey<AdminOptions>;
export const integralKey = Symbol() as InjectionKey<IntegralContext>;
export const sessionKey = Symbol() as InjectionKey<{
  user: Ref<Session["user"] | null>;
  signOut: () => Promise<void>;
}>;

export function pagePath(key: string, page: Page) {
  return page.route ?? `/${key}`;
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

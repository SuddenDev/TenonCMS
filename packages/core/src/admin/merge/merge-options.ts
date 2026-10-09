import type {
  AdminDescriptor,
  AdminOptions,
  FieldLoadContext,
  PageLoadContext,
  PluginAdminOptions,
} from "../index";
import type { Plugin } from "../../plugins/types.ts";
import type { DescribedItem } from "../describe/describe-bar-item.ts";
import { describeField, describePage } from "../describe/describe-registration.ts";
import { addBarItems, buildBar, type AdminBar } from "./merge-bar.ts";
import { copyConfig, type Loader } from "../describe/registration-checks.ts";

/**
 * The admin registrations of one CMS instance. Only `descriptor` leaves the server: it holds no functions.
 * The loaders stay here and run per request. Maps keep keys from the request away from the prototype.
 */
export type AdminRuntime = {
  descriptor: AdminDescriptor;
  fieldLoaders: Map<string, Loader<FieldLoadContext>>;
  pageLoaders: Map<string, Loader<PageLoadContext>>;
  /** `false` without a bar. */
  bar: false | AdminBar;
};

type Source = [name: string, admin: AdminOptions | PluginAdminOptions | undefined];

const BRANDING = ["name", "logo", "icon", "favicon", "media"] as const;
const HOST = "integral.config.ts";

/**
 * Combines the active registrations in plugin order, then host order.
 * Fields and pages MUST NOT repeat a key. The host's branding wins. Bar items replace by id.
 */
export function mergeAdmin(plugins: readonly Plugin[], host: AdminOptions = {}): AdminRuntime {
  const descriptor: AdminDescriptor = { fields: {}, pages: {} };
  const fieldLoaders = new Map<string, Loader<FieldLoadContext>>();
  const pageLoaders = new Map<string, Loader<PageLoadContext>>();
  const barItems = new Map<string, DescribedItem>();

  const sources: Source[] = [
    ...plugins.map((p): Source => [`plugin "${p.name}"`, p.admin]),
    [HOST, host],
  ];
  for (const [source, admin] of sources) {
    if (!admin) continue;
    addBranding(descriptor, admin, source);
    addEntries("fields", descriptor.fields, fieldLoaders, admin.fields, describeField, source);
    addEntries("pages", descriptor.pages, pageLoaders, admin.pages, describePage, source);
    addBarItems(barItems, admin.adminBar, source, source === HOST);
  }

  return { descriptor, fieldLoaders, pageLoaders, bar: buildBar(host.adminBar, barItems) };
}

/** Only branding needed before sign-in is public. */
export function adminBrand({ name, logo, icon, favicon }: AdminDescriptor) {
  return { name, logo, icon, favicon };
}

// A later source overwrites the branding of an earlier one, so the host wins.
function addBranding(descriptor: AdminDescriptor, admin: AdminOptions, source: string) {
  for (const key of BRANDING)
    if (admin[key] !== undefined)
      (descriptor as any)[key] = copyConfig(admin[key], `admin.${key} in ${source}`);
}

function addEntries<D, C>(
  kind: "fields" | "pages",
  descriptors: Record<string, D>,
  loaders: Map<string, Loader<C>>,
  registrations: Record<string, unknown> | undefined,
  describe: (key: string, value: unknown, source: string) => { descriptor: D; loader?: unknown },
  source: string,
) {
  for (const [key, value] of Object.entries(registrations ?? {})) {
    if (Object.hasOwn(descriptors, key))
      throw new Error(`integral-cms: duplicate admin ${kind} key "${key}" in ${source}`);
    const { descriptor, loader } = describe(key, value, source);
    descriptors[key] = descriptor;
    if (loader) loaders.set(key, { source, load: loader as never });
  }
}

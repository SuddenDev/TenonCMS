import type { RichtextRegistration } from "../../richtext/config/types.ts";
import { RICHTEXT_FEATURES, richtextSchema } from "../../richtext/runtime/extensions.ts";
import { requireRef } from "../describe/registration-checks.ts";
import type {
  ActionContext,
  ActionRegistration,
  AdminDescriptor,
  AdminOptions,
  FieldLoadContext,
  PageLoadContext,
  PluginAdminOptions,
} from "../index";
import type { Plugin } from "../../plugins/types.ts";
import type { DescribedItem } from "../describe/describe-bar-item.ts";
import { describeField, describePage } from "../describe/describe-registration.ts";
import { describeAction } from "../describe/describe-action.ts";
import { addBarItems, buildBar, type AdminBar } from "./merge-bar.ts";
import { copyConfig, type Loader } from "../describe/registration-checks.ts";

/** The server parts of an action. A link has no `run`. */
export type ActionEntry = {
  source: string;
  access?: ActionRegistration["access"];
  run?: (ctx: ActionContext) => unknown;
};

/**
 * The admin registrations of one CMS instance. Only `descriptor` leaves the server: it holds no functions.
 * The loaders stay here and run per request. Maps keep keys from the request away from the prototype.
 */
export type AdminRuntime = {
  descriptor: AdminDescriptor;
  richtext: Record<string, RichtextRegistration>;
  fieldLoaders: Map<string, Loader<FieldLoadContext>>;
  pageLoaders: Map<string, Loader<PageLoadContext>>;
  actions: Map<string, ActionEntry>;
  /** `false` without a bar. */
  bar: false | AdminBar;
};

type Source = [name: string, admin: AdminOptions | PluginAdminOptions | undefined];

const BRANDING = ["name", "logo", "icon", "favicon", "media"] as const;
const HOST = "tenon.config.ts";

/**
 * Combines the active registrations in plugin order, then host order.
 * Fields, pages and actions MUST NOT repeat a key. The host's branding wins. Bar items replace by id.
 */
export function mergeAdmin(plugins: readonly Plugin[], host: AdminOptions = {}): AdminRuntime {
  const descriptor: AdminDescriptor = { fields: {}, pages: {}, actions: {} };
  const fieldLoaders = new Map<string, Loader<FieldLoadContext>>();
  const pageLoaders = new Map<string, Loader<PageLoadContext>>();
  const richtext: Record<string, RichtextRegistration> = Object.create(null);
  const barItems = new Map<string, DescribedItem>();
  const actions = new Map<string, ActionEntry>();

  const sources: Source[] = [
    ...plugins.map((p): Source => [`plugin "${p.name}"`, p.admin]),
    [HOST, host],
  ];

  for (const [source, admin] of sources) {
    if (!admin) continue;

    addBranding(descriptor, admin, source);

    for (const [name, registration] of Object.entries(admin.richtext?.extensions ?? {})) {
      if (Object.hasOwn(richtext, name) || (RICHTEXT_FEATURES as readonly string[]).includes(name))
        throw new Error(`tenoncms: duplicate rich text feature "${name}"`);

      const client = requireRef(
        registration.client,
        `admin.richtext.extensions.${name}.client`,
        source,
      );
      if (!registration.schema)
        throw new Error(`tenoncms: rich text feature "${name}" needs a schema`);

      richtext[name] = registration;
      descriptor.richtext ??= { extensions: {} };
      descriptor.richtext.extensions[name] = { client };
    }

    addEntries("fields", descriptor.fields, fieldLoaders, admin.fields, describeField, source);
    addEntries("pages", descriptor.pages, pageLoaders, admin.pages, describePage, source);
    for (const [key, value] of Object.entries(admin.actions ?? {})) {
      if (actions.has(key))
        throw new Error(`tenoncms: duplicate admin actions key "${key}" in ${source}`);
      const described = describeAction(key, value, source);
      descriptor.actions[key] = described.descriptor;
      actions.set(key, described.action);
    }
    addBarItems(barItems, admin.adminBar, source, source === HOST);
  }

  if (Object.keys(richtext).length) richtextSchema(undefined, richtext);

  return {
    descriptor,
    richtext,
    fieldLoaders,
    pageLoaders,
    actions,
    bar: buildBar(host.adminBar, barItems),
  };
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
      throw new Error(`tenoncms: duplicate admin ${kind} key "${key}" in ${source}`);

    const { descriptor, loader } = describe(key, value, source);
    descriptors[key] = descriptor;
    if (loader) loaders.set(key, { source, load: loader as never });
  }
}

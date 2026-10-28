import type { Localization } from "../../cms/config/options.ts";
import { localizePath } from "../../helpers/locale-path.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { isObject } from "../../schema/condition.ts";
import type { Collection, Fields, Global, LocalApi, Preview } from "../../schema/index.ts";
import { fieldAt } from "../../schema/traversal/field-at.ts";
import { placeholders } from "../templates/placeholders.ts";
import { resolveTemplate } from "../templates/resolve-template.ts";

type Entry = Pick<Collection | Global, "fields" | "permalink" | "preview">;

/** The locale of the document and the `localization` config. Without `localization`, URLs stay as they are. */
export type UrlLocale = { locale?: string; localization?: Localization };

/**
 * The {@link UrlLocale} of a preview-url request: the validated `?locale=`, or the default locale.
 * @throws {ValidationError} For an unknown locale, or any locale without `localization`.
 */
export function urlLocale(core: Core, locale?: string): UrlLocale {
  return {
    locale: withLocale(core, outerScope({ user: null }), { locale }).locale,
    localization: core.localization,
  };
}

/**
 * The preview URL of a document or global from its unsaved form state, or `null` for no preview.
 * `preview` wins and defaults to `permalink`. A template reads one relation hop through `cms.findById`; a function
 * gets `{ cms, locale }`. With `routing`, the `permalink` default gets the locale prefix and an explicit `preview` does not.
 */
export function previewUrl(entry: Entry, data: unknown, cms: LocalApi, where: UrlLocale = {}) {
  return resolveUrl(entry, entry.preview ?? entry.permalink, data, cms, where, !entry.preview);
}

/**
 * The public URL of a document or global from `permalink` only, or `null`. Resolves like {@link previewUrl}, with
 * the locale prefix of `routing`.
 */
export function permalinkUrl(entry: Entry, data: unknown, cms: LocalApi, where: UrlLocale = {}) {
  return resolveUrl(entry, entry.permalink, data, cms, where, true);
}

async function resolveUrl(
  entry: Entry,
  template: Preview | undefined,
  data: unknown,
  cms: LocalApi,
  { locale, localization }: UrlLocale,
  prefix: boolean,
): Promise<string | null> {
  const doc = isObject(data) ? structuredClone(data) : {};
  const at = locale ?? localization?.defaultLocale;
  if (at !== undefined && localization?.routing === false) doc.locale = at;
  let url: string | null;

  if (typeof template === "function") {
    url = (await template(doc, { cms, locale: at })) ?? null;
  } else {
    if (!template) return null;
    for (const path of placeholders(template)) {
      await hop(entry.fields, doc, path, cms);
    }
    url = resolveTemplate(template, doc);
  }

  return url !== null && prefix && localization && at !== undefined
    ? localizePath(url, at, localization)
    : url;
}

// Replaces the id of the first relation on `path` with its document, in place.
async function hop(fields: Fields, doc: Record<string, unknown>, path: string, cms: LocalApi) {
  const keys = path.split(".");
  let holder: unknown = doc;

  for (let i = 0; i < keys.length - 1 && isObject(holder); i++) {
    const field = fieldAt(fields, keys.slice(0, i + 1).join("."));
    const value = holder[keys[i]!];

    if (field?.type !== "relation") {
      holder = value;
      continue;
    }

    if (typeof value === "string") {
      holder[keys[i]!] = (await cms.findById(field.collection, value, { populate: false })) ?? null;
    }

    return;
  }
}

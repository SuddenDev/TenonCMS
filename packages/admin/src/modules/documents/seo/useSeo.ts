import { watchDebounced } from "@vueuse/core";
import { computed, inject, ref, shallowRef, watch } from "vue";
import { client, schema, seoMeta } from "@/shared/api";
import { useLocale } from "@/shared/composables/useLocale";
import { ownerKey } from "@/modules/documents/fields";
import { passingChecks } from "./seo-checks";

type Settings = NonNullable<Parameters<typeof seoMeta>[1]>;

/**
 * State of the SEO editor of a group: the site settings, what the site renders for the unsaved document, the
 * site defaults for an empty title and description, and the page URL.
 * @param root The unsaved document. Placeholders read its fields.
 * @param group The unsaved `seo` group.
 * @param templates The collection's templates from `seo()`. They win over the site's.
 */
export function useSeo(
  root: () => Record<string, unknown>,
  group: () => Record<string, unknown>,
  templates: () => Settings["templates"],
) {
  const { locale } = useLocale();
  const owner = inject(ownerKey, undefined);
  const settings = shallowRef<Settings>({});
  const url = ref<string>();

  watch(
    locale,
    async (code) => {
      const [general, seo] = await Promise.all([
        readGlobal("general", code),
        readGlobal("seo", code),
      ]);
      settings.value = { general, seo };
    },
    { immediate: true },
  );

  const site = computed(() => ({ ...settings.value, templates: templates() }));
  const meta = computed(() => seoMeta({ ...root(), seo: group() }, site.value));
  // What the site renders without own values. Empty fields show it, so the template is visible.
  const defaults = computed(() => seoMeta({ ...root(), seo: {} }, site.value));
  // What Auto-generate copies. An own title fills `{title}` of the template unless it is the full title, so it is
  // that part alone.
  const generated = computed(() => {
    if (group().fullTitle) return defaults.value;
    const part = seoMeta({ ...root(), seo: { title: "{title}", fullTitle: true } }, site.value);
    return { ...defaults.value, title: part.title };
  });
  // The rest of the rendered title after the own title, e.g. ` · Acme`. Empty when the template puts text before it.
  const suffix = computed(() => {
    const own = group().title;
    if (typeof own !== "string" || !own || group().fullTitle) return "";
    const part = seoMeta({ ...root(), seo: { title: own, fullTitle: true } }, site.value).title;
    return meta.value.title.startsWith(part) ? meta.value.title.slice(part.length) : "";
  });
  const passing = computed(() =>
    passingChecks({
      title: meta.value.title,
      description: meta.value.description,
      image: !!group().image || !!settings.value.seo?.image,
    }),
  );

  // The permalink can depend on any field, so every edit asks again. A late answer for older data is dropped.
  let asked = 0;
  watchDebounced(
    () => [JSON.stringify(root()), settings.value],
    async () => {
      const at = ++asked;
      const next = await pageUrl(root(), settings.value, locale.value);
      if (at === asked) url.value = next;
    },
    { debounce: 400, immediate: true },
  );

  async function pageUrl(data: Record<string, unknown>, site: Settings, code?: string) {
    const base = site.general?.url || schema.value.site || location.origin;
    const target = owner?.value;
    const entry = target
      ? "global" in target
        ? schema.value.globals?.[target.global]
        : schema.value.collections?.[target.collection]
      : undefined;
    if (!target || !entry?.preview) return base;

    const options = entry.localized && code ? { locale: code } : {};
    const path = await (
      "global" in target
        ? client.previewGlobalUrl(target.global, data, options)
        : client.previewUrl(target.collection, data, options)
    ).catch(() => null);
    return path ? new URL(path, base).href : base;
  }

  return { meta, defaults, generated, suffix, passing, url };
}

/** A settings global in the content locale. A dropped or failing global reads as empty, so defaults apply. */
async function readGlobal(name: string, code?: string): Promise<any> {
  const global = schema.value.globals?.[name];
  if (!global) return {};
  const options = global.localized && code ? { locale: code } : {};
  return client.getGlobal(name, { populate: false, ...options }).catch(() => ({}));
}

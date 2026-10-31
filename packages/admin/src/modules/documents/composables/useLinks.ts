import { computed, inject, type InjectionKey, provide, reactive, watch } from "vue";
import { client, type Fields } from "@/shared/api";
import { useLocale } from "@/shared/composables/useLocale";
import type { LinkResolution } from "../../../../../core/src/links/config/types";
import { linkKey } from "../../../../../core/src/links/runtime/value";
import { linkReferences } from "@/modules/documents/links";
import type { ResolveLink } from "@/modules/documents/items";

type Links = {
  resolve: ResolveLink;
  /** Shows a title before the server answers, like the label of a search result. */
  remember(reference: { collection: string; id: string }, title: string): void;
};

const linksKey: InjectionKey<Links> = Symbol("links");

/**
 * Resolves the references of the form's `link` fields, so rows and inputs show titles and paths. Each reference is
 * asked for once per language, the ones on load in one request.
 */
export function provideLinks(fields: () => Fields, data: () => Record<string, any>) {
  const { locale } = useLocale();
  const known = reactive(new Map<string, LinkResolution>());
  const asked = new Set<string>();
  const references = computed(() => linkReferences(fields(), data()));

  watch(locale, () => {
    known.clear();
    asked.clear();
  });

  watch(
    [() => references.value.map(linkKey).join(), locale],
    async () => {
      const missing = [
        ...new Map(
          references.value.filter((r) => !asked.has(linkKey(r))).map((r) => [linkKey(r), r]),
        ).values(),
      ];
      if (!missing.length) return;

      for (const r of missing) asked.add(linkKey(r));
      const at = locale.value;
      try {
        const resolved = await client.links.resolve(
          missing.map(({ collection, id, deleted }) => ({ collection, id, deleted })),
          { locale: at },
        );
        if (at === locale.value) missing.forEach((r, i) => known.set(linkKey(r), resolved[i]));
      } catch {
        for (const r of missing) asked.delete(linkKey(r));
      }
    },
    { immediate: true },
  );

  const links: Links = {
    resolve: (reference) => known.get(linkKey(reference)),
    remember(reference, title) {
      if (!known.has(linkKey(reference))) known.set(linkKey(reference), { href: null, title });
    },
  };
  provide(linksKey, links);
  return links;
}

/** The link resolutions of the form. Outside a form, nothing resolves. */
export const injectLinks = (): Links =>
  inject(linksKey, { resolve: () => undefined, remember: () => {} });

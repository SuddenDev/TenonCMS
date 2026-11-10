# Verification and tracking

The default `seo` settings have no verification codes and no tracking IDs. Every site needs a different set, so you add the fields you need to `seo` and render them in your layout. Editors can then change an ID in the admin without a developer.

Google Tag Manager is the main ID to add. Once the container is on the site, an agency can add Google Analytics, the Meta Pixel and other tags in GTM's own interface. Custom events, like a form submit, still need code: `dataLayer.push({ event: "signup" })`.

## Add the fields

Extend the `seo` default with two groups. `pattern` rejects a typo before it reaches the page.

```ts
import { defineCms } from "tenoncms";
import { settings } from "tenoncms/presets";

const { seo } = settings();

export default defineCms({
  settings: {
    seo: {
      ...seo,
      fields: {
        ...seo.fields,
        verification: {
          type: "group",
          separator: true,
          label: { en: "Verification", de: "Verifizierung" },
          fields: {
            google: { type: "text", label: "Google Search Console" },
            bing: { type: "text", label: "Bing Webmaster Tools" },
          },
        },
        tracking: {
          type: "group",
          separator: true,
          label: { en: "Tracking", de: "Tracking" },
          fields: {
            gtm: {
              type: "text",
              label: "Google Tag Manager",
              pattern: "GTM-[A-Z0-9]+",
              placeholder: "GTM-XXXXXXX",
            },
          },
        },
      },
    },
  },
});
```

- Add only IDs, never a field for script code. Anyone who can edit settings could run code on every page, and a site with a Content Security Policy would block the script anyway.
- With `localization`, the `seo` global is localized. Add `localized: false` to both groups to keep one value for all languages. Without `localization`, it throws at startup.
- A site without GTM can add more fields the same way, like `ga4` (`pattern: "G-[A-Z0-9]+"`) or `metaPixel` (`pattern: "[0-9]+"`).
- Verification through DNS needs no field at all. Use the meta tag when the client cannot change DNS.

## Consent

In the EU, analytics and marketing scripts MUST NOT load before the visitor agrees. The examples below follow that rule:

- They set Google's [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent) to "denied" first.
- They load GTM only after consent, through `grantConsent()` (Astro, TanStack Start) or a consent trigger (Nuxt).

Who calls it is up to you: your own banner, or a consent tool such as Usercentrics or Cookiebot. Call it on every page load once the visitor has agreed, because the choice is stored by the banner, not by the snippet. A consent tool that sets Consent Mode itself has its own setup; follow its docs.

## Astro and TanStack Start

Both use the same inline script. Put it in a file of its own:

```ts
// src/tracking.ts
const denied = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
};

/** Inline script: sets the consent defaults and defines `grantConsent()`, which loads GTM. Safe to run twice. */
export function gtmScript(id: string) {
  const src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  return `if (!window.grantConsent) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("consent", "default", ${JSON.stringify(denied)});
  window.grantConsent = function (consent) {
    gtag("consent", "update", consent);
    if (document.getElementById("gtm")) return;
    dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    document.head.append(Object.assign(document.createElement("script"), { id: "gtm", async: true, src: ${JSON.stringify(src)} }));
  };
}`;
}
```

The banner then calls, for example:

```js
grantConsent({
  analytics_storage: "granted",
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
});
```

### Astro

In the layout:

```astro
---
import { gtmScript } from "../tracking";

const { tenon } = Astro.locals;
const { verification, tracking } = await tenon.getGlobal("seo");
---

<head>
  {verification?.google && <meta name="google-site-verification" content={verification.google} />}
  {verification?.bing && <meta name="msvalidate.01" content={verification.bing} />}
  {tracking?.gtm && <script is:inline set:html={gtmScript(tracking.gtm)} />}
</head>
```

- A prerendered page keeps the IDs it had at build time. Rebuild after a change, for example with a [deploy hook](./webhooks.md) on the `seo` global. Pages that render on request always use the current IDs.
- With `<ClientRouter />`, inline scripts MAY run again after a navigation. The `if (!window.grantConsent)` guard keeps the consent state.

### TanStack Start

In the root route:

```tsx
// src/routes/__root.tsx
import { createRootRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import cms from "../../tenon.config";
import { gtmScript } from "../tracking";

const getSeo = createServerFn().handler(() => cms.getGlobal("seo"));

export const Route = createRootRoute({
  loader: () => getSeo(),
  head: ({ loaderData }) => {
    const verification = loaderData?.verification;
    const tracking = loaderData?.tracking;
    return {
      meta: [
        verification?.google && { name: "google-site-verification", content: verification.google },
        verification?.bing && { name: "msvalidate.01", content: verification.bing },
      ].filter((tag) => !!tag),
      scripts: tracking?.gtm ? [{ children: gtmScript(tracking.gtm) }] : [],
    };
  },
});
```

`<HeadContent />` in the root component renders both.

## Nuxt

Use [Nuxt Scripts](https://scripts.nuxt.com). It loads GTM, Google Analytics, the Meta Pixel and others with consent support, and takes the ID at runtime.

```sh
npx nuxt module add scripts
```

One consent trigger for the whole app:

```ts
// app/utils/consent.ts
export const scriptsConsent = useScriptTriggerConsent();
```

In `app.vue`:

```vue
<script setup lang="ts">
const { data: seo } = await useTenon().getGlobal("seo");
const verification = seo.value?.verification;
const tracking = seo.value?.tracking;

useHead({
  meta: [
    { name: "google-site-verification", content: verification?.google },
    { name: "msvalidate.01", content: verification?.bing },
  ].filter((tag) => tag.content),
});

const gtm = tracking?.gtm
  ? useScriptGoogleTagManager({
      id: tracking.gtm,
      defaultConsent: {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
      scriptOptions: { trigger: scriptsConsent },
    })
  : undefined;

function acceptAll() {
  scriptsConsent.accept();
  // `consent` is undefined during SSR.
  gtm?.consent?.update({
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    analytics_storage: "granted",
  });
}
</script>
```

- Pass `scriptOptions: { trigger: scriptsConsent }` to every call of the same script. One call without it loads the script before consent.
- Without GTM, `useScriptGoogleAnalytics({ id })` and `useScriptMetaPixel({ id, defaultConsent: "denied" })` work the same way.

## Page views on client-side navigation

Nuxt, TanStack Start and Astro with `<ClientRouter />` change pages without a full load. The script loads once and counts later pages itself:

- Google Analytics 4 counts history changes by default ("enhanced measurement").
- In GTM, fire page view tags on the built-in **History Change** trigger.
- The Meta Pixel counts history changes by itself.

Send your own page views only when these are off, or a page counts twice.

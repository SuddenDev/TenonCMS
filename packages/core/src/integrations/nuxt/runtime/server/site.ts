import cms from "#tenon/config";

type Nitro = {
  hooks: {
    hook(name: "request", run: (event: { context: Record<string, unknown> }) => void): void;
  };
};

/** Puts `site.url` on each request's `event.context`, where `useTenonSeo()` reads it during SSR. */
export default (nitro: Nitro) =>
  nitro.hooks.hook("request", (event) => {
    event.context.tenonSiteUrl = cms.site.url;
  });

/** Adapter option for the admin: `true` serves it at `/admin`, a path like `/cms` serves it there, `false` serves none. */
export type AdminOption = boolean | `/${string}`;

/** Options of the Astro and Nuxt adapters. */
export type AdapterOptions = {
  /** File that exports the `cms` instance, relative to the project root. Defaults to `./tenon.config.ts`. */
  entry?: string;
  /** Path of the admin, e.g. `/cms`. Defaults to `/admin`. `false` leaves only the API (headless). */
  admin?: AdminOption;
  /**
   * Serves `/sitemap.xml` from the CMS. Defaults to `true`. The adapter skips it when the host serves the path itself
   * (a file in `public/` or its own route).
   */
  sitemap?: boolean;
  /** Serves `/robots.txt` from the CMS. Defaults to `true`, and skipped like `sitemap`. */
  robots?: boolean;
};

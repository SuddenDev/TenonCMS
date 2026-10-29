import { CMS_SECRET, DATABASE_URL, SITE_URL, SMTP_URL, EMAIL_FROM } from "astro:env/server";
import { defineCms, defineGlobal } from "integral-cms";
import { libsql } from "integral-cms/libsql";
import { smtp } from "integral-cms/email/smtp";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { RedirectsPlugin } from "integral-cms/plugins/redirects";
import { strings } from "integral-cms/presets";
import { authors } from "./collections/authors";
import { comments } from "./collections/comments";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";
import { kitchenSink } from "./globals/kitchen-sink";

export default defineCms({
  localization: { locales: ["en", "de"], defaultLocale: "en", fallback: false },
  roles: { author: { label: { en: "Author", de: "Autor" }, description: "Writes own posts" } },
  collections: { posts, authors, comments, pages },
  globals: {
    kitchenSink,
    footer: defineGlobal({
      label: "Footer",
      description: "Links and copyright line",
      nav: { display: "settings", icon: "panel-bottom", order: 3 },
      fields: { copyright: { type: "text" } },
    }),
    strings: strings({
      allPosts: { label: "All posts link", default: { en: "All posts", de: "Alle Beiträge" } },
      comments: { label: "Comments heading", default: { en: "Comments", de: "Kommentare" } },
      commentName: { label: "Comment name field", default: { en: "Name", de: "Name" } },
      commentBody: { label: "Comment text field", default: { en: "Comment", de: "Kommentar" } },
      commentSend: { label: "Comment button", default: { en: "Send", de: "Senden" } },
      commentThanks: {
        label: "Comment sent note",
        default: {
          en: "Thanks! Your comment shows once it is approved.",
          de: "Danke! Dein Kommentar erscheint, sobald er freigegeben ist.",
        },
      },
    }),
  },
  plugins: [RedirectsPlugin({ locales: ["en", "de"] }), ExamplePlugin({ renderer: "html" })],
  database: libsql(DATABASE_URL),
  secret: CMS_SECRET,
  email: SMTP_URL
    ? {
        adapter: smtp({ url: SMTP_URL, requireTLS: import.meta.env.PROD }),
        from: EMAIL_FROM,
      }
    : undefined,
  site: SITE_URL,
  admin: {
    name: "Example site",
    media: { nav: { group: "Blog", icon: "images" } },
  },
});

import { CMS_SECRET, DATABASE_URL, SITE_URL, SMTP_URL, EMAIL_FROM } from "astro:env/server";
import { passkey } from "@better-auth/passkey";
import { defineCms, defineGlobal } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { smtp } from "tenoncms/email/smtp";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { RedirectsPlugin } from "tenoncms/plugins/redirects";
import { menu, pagesPreset, strings } from "tenoncms/presets";
import { authors } from "./collections/authors";
import { comments } from "./collections/comments";
import { posts } from "./collections/posts";
import { kitchenSink } from "./globals/kitchen-sink";

const mainMenu = menu({
  depth: -1,
  blocks: {
    button: {
      label: "Button",
      icon: "a-arrow-down",
      fields: { label: { type: "text" }, link: { type: "link" } },
    },
  },
});

export default defineCms({
  localization: { locales: ["en", "de"], defaultLocale: "en", fallback: false },
  roles: { author: { label: { en: "Author", de: "Autor" }, description: "Writes own posts" } },
  // A section holds other blocks, sections included, so page content nests to any depth.
  blocks: {
    ...mainMenu.blocks,
    hero: {
      label: "Hero",
      icon: "image",
      fields: { title: { type: "text" }, image: { type: "image" } },
    },
    text: { label: "Text", icon: "type", fields: { body: { type: "textarea" } } },
    section: {
      label: "Section",
      description: "A heading with blocks inside, sections included.",
      icon: "layers",
      fields: {
        title: { type: "text" },
        children: {
          type: "blocks",
          itemLabels: { singular: "Block", plural: "Blocks" },
          blocks: ["hero", "text", "section"],
        },
      },
    },
  },
  collections: { posts, authors, comments },
  presets: [pagesPreset({ seo: true, localized: true, blocks: ["hero", "text", "section"] })],
  globals: {
    kitchenSink,
    mainMenu: defineGlobal({
      label: "Main menu",
      localized: true,
      nav: { display: "settings", icon: "menu", order: 2 },
      fields: {
        cta: {
          type: "group",
          fields: {
            cta: { type: "text" },
            ctaLink: { type: "link" },
          },
        },
        ...mainMenu.fields,
      },
    }),
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
  auth: { plugins: [passkey()] },
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

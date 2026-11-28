import type { LocalApi } from "tenoncms";

/**
 * Fills a new database with the starter content: the site title, two pages, the menu and one image. Runs once per
 * database without content, so a new production database gets it too. Remove `seed` from tenon.config.ts once the
 * site has its own content.
 */
export async function seed(cms: LocalApi, siteName: string) {
  await cms.setGlobal("general", { title: siteName });

  const upload =
    cms.media &&
    (await cms.media.upload(new TextEncoder().encode(ILLUSTRATION), {
      filename: "page-of-blocks.svg",
      mimeType: "image/svg+xml",
    }));
  if (upload) await cms.media!.update(upload.id, { alt: "A page built from blocks" });
  const image = (caption: string) =>
    upload ? [{ blockType: "image", image: upload.id, caption }] : [];

  const about = await cms.create("pages", {
    title: "About",
    content: [
      {
        blockType: "hero",
        title: "About",
        intro: "Say who you are and what you do. Visitors read this page before they get in touch.",
      },
      {
        blockType: "text",
        title: "The short version",
        body: doc(
          paragraph(
            "This is a text block. It holds rich text: paragraphs, lists and links. The title on the left is optional.",
          ),
          paragraph(
            "Write two or three short paragraphs. Lead with what you do, then say who it is for.",
          ),
          list("What you do", "Who you do it for", "How to reach you"),
          paragraph(
            "Questions? Write to ",
            link("hello@example.com", "mailto:hello@example.com"),
            ".",
          ),
        ),
      },
      ...image("The caption is optional. Leave it empty and it does not show."),
    ],
  });

  await cms.create("pages", {
    title: "Home",
    slug: "index",
    content: [
      {
        blockType: "hero",
        title: "A small website you can edit in place.",
        intro:
          "This page is built from blocks. Sign in to change the text, swap the image or add a section.",
        links: [
          { label: "Open the admin", link: { href: "/admin" } },
          { label: "About this site", link: { reference: { collection: "pages", id: about.id } } },
        ],
      },
      ...image("An image block. Upload a new image in the admin to replace it."),
      {
        blockType: "list",
        title: "How it fits together",
        intro: "Each part below is a file in your project and a place in the admin.",
        items: [
          {
            title: "Pages",
            text: "Each page is a document with a path. This one is /.",
            note: "pagesPreset()",
          },
          {
            title: "Blocks",
            text: "The sections of a page. Add, remove or reorder them.",
            note: "cms/blocks.ts",
          },
          {
            title: "Menu",
            text: "The links in the header. Edit them under Settings.",
            note: "menuPreset()",
          },
          {
            title: "Media",
            text: "Uploaded images, served in the size each layout needs.",
            note: "<Image>",
          },
          {
            title: "SEO",
            text: "A title, a description and a share image for every page.",
            note: "seoHead()",
          },
          {
            title: "Live preview",
            text: "Edit a page and watch it change here before you publish.",
            note: "edit()",
          },
        ],
      },
    ],
  });

  await cms.setGlobal("mainMenu", {
    items: [
      { blockType: "link", link: { reference: { collection: "pages", id: about.id } } },
      { blockType: "link", label: "Contact", link: { href: "mailto:hello@example.com" } },
    ],
  });
}

// Tiptap JSON, the format of a `richtext` field.
type Inline = string | ReturnType<typeof link>;
const toNode = (part: Inline) => (typeof part === "string" ? { type: "text", text: part } : part);
const doc = (...content: object[]) => ({ type: "doc", content });
const paragraph = (...parts: Inline[]) => ({ type: "paragraph", content: parts.map(toNode) });
const link = (text: string, href: string) => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }],
});
const list = (...items: string[]) => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
});

// An SVG, so the seed needs no image file and runs on every host. Its colors follow light and dark mode.
const ILLUSTRATION = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800" viewBox="0 0 1600 800">
<style>.bg{fill:#EDEDEB}.page{fill:#FFF}.ink{fill:#0A0A0A}.faint{fill:#A3A3A0}.soft{fill:#BDBDBA}.box{fill:#E4E4E2}.blue{fill:#2B59FF}
@media (prefers-color-scheme:dark){.bg{fill:#171717}.page{fill:#0A0A0A}.ink{fill:#EDEDED}.faint{fill:#737373}.soft{fill:#525252}.box{fill:#262626}}</style>
<defs><filter id="lift" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dy="14" stdDeviation="18" flood-opacity=".14"/></filter></defs>
<rect width="1600" height="800" class="bg"/>
<rect x="520" y="96" width="560" height="760" rx="8" class="page"/>
<rect x="568" y="136" width="96" height="12" rx="2" class="ink"/>
<rect x="968" y="138" width="40" height="8" rx="2" class="faint"/>
<rect x="1020" y="138" width="28" height="8" rx="2" class="faint"/>
<rect x="568" y="200" width="380" height="30" rx="3" class="ink"/>
<rect x="568" y="244" width="260" height="30" rx="3" class="ink"/>
<rect x="568" y="300" width="300" height="10" rx="2" class="soft"/>
<rect x="568" y="320" width="230" height="10" rx="2" class="soft"/>
<rect x="568" y="356" width="112" height="32" rx="5" class="ink"/>
<rect x="700" y="378" width="88" height="2" class="ink"/>
<rect x="568" y="424" width="464" height="200" rx="4" class="box"/>
<rect x="568" y="658" width="464" height="3" rx="1.5" class="blue"/>
<rect x="568" y="700" width="464" height="1" class="box"/>
<rect x="568" y="724" width="80" height="10" rx="2" class="ink"/>
<rect x="700" y="724" width="220" height="10" rx="2" class="soft"/>
<rect x="568" y="764" width="464" height="1" class="box"/>
<g transform="rotate(-5 1236 470)" filter="url(#lift)">
<rect x="1100" y="396" width="272" height="148" rx="8" class="page"/>
<rect x="1128" y="428" width="132" height="14" rx="2" class="ink"/>
<rect x="1128" y="462" width="200" height="8" rx="2" class="soft"/>
<rect x="1128" y="480" width="160" height="8" rx="2" class="soft"/>
<rect x="1128" y="506" width="64" height="18" rx="4" class="blue"/>
</g>
</svg>`;

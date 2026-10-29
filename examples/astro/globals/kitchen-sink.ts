import { defineGlobal } from "tenoncms";

// Every field type and layout option once. A global MUST NOT hold a join or a `unique` field:
// `authors.posts` is the join of this example.
export const kitchenSink = defineGlobal({
  label: { en: "Kitchen sink", de: "Küchenspüle" },
  description: { en: "Every field and layout option", de: "Alle Felder und Layout-Optionen" },
  nav: { group: "Demo", icon: "cooking-pot" },
  localized: true,
  permalink: "/kitchensink",
  tabs: {
    text: { label: "Text", icon: "type" },
    choices: { label: { en: "Choices", de: "Auswahl" }, icon: "list-checks" },
    numbers: { label: { en: "Numbers & dates", de: "Zahlen & Daten" }, icon: "hash" },
    media: { label: { en: "Media & relations", de: "Medien & Bezüge" }, icon: "image" },
    structure: { label: { en: "Groups & lists", de: "Gruppen & Listen" }, icon: "layers" },
  },
  fieldsets: {
    extras: {
      label: "Extras",
      description: "Collapsible and closed at first.",
      collapsible: true,
      collapsed: true,
    },
    schedule: {
      label: { en: "Schedule", de: "Zeitplan" },
      description: "A box that cannot close.",
    },
  },
  fields: {
    // Above the tab bar: fields without `tab`.
    headline: {
      type: "text",
      label: { en: "Headline", de: "Überschrift" },
      description: "Required, at most 80 characters, trimmed by a field hook.",
      required: true,
      maxLength: 80,
      placeholder: "Everything but the kitchen sink",
      hooks: { beforeChange: [({ value }) => value?.trim()] },
    },
    slug: { type: "slug", from: "headline", width: "1/2" },
    status: {
      type: "select",
      appearance: "buttons",
      options: [
        { value: "draft", label: { en: "Draft", de: "Entwurf" } },
        { value: "live", label: "Live" },
      ],
      default: "draft",
      required: true,
      width: "1/2",
    },

    // Text
    body: {
      type: "richtext",
      tab: "text",
      label: { en: "Rich text", de: "Formatierter Text" },
      description: "Tiptap JSON with internal links and media relations.",
    },
    intro: { type: "textarea", tab: "text", minLength: 10, description: "At least 10 characters." },
    code: {
      type: "text",
      tab: "text",
      pattern: "[A-Z]{3}-[0-9]{3}",
      placeholder: "ABC-123",
      description: "Matches a pattern.",
      width: "1/3",
    },
    shortName: { type: "text", tab: "text", minLength: 2, maxLength: 12, width: "1/3" },
    shared: {
      type: "text",
      tab: "text",
      localized: false,
      description: "The same in every language.",
      width: "1/3",
    },
    secret: {
      type: "text",
      tab: "text",
      fieldset: "extras",
      private: true,
      description: "Private: public reads leave it out.",
      width: "1/2",
    },
    adminNote: {
      type: "text",
      tab: "text",
      fieldset: "extras",
      access: { update: ["admin"] },
      description: "Only admins change it; other roles see it disabled.",
    },
    length: {
      type: "number",
      tab: "text",
      fieldset: "extras",
      readOnly: true,
      description: "Read-only, set by a hook to the headline's length.",
      width: "1/2",
      hooks: { beforeChange: [({ data }) => String(data.headline ?? "").length] },
    },
    note: {
      type: "textarea",
      tab: ["text", "choices"],
      description: "Shown in two tabs.",
    },

    // Choices
    featured: { type: "boolean", tab: "choices", width: "1/2" },
    notify: { type: "boolean", appearance: "switch", tab: "choices", width: "1/2" },
    reason: {
      type: "text",
      tab: "choices",
      required: true,
      condition: { featured: true },
      description: "Only when featured.",
    },
    color: {
      type: "select",
      tab: "choices",
      description: "A searchable dropdown.",
      options: [
        "red",
        "orange",
        "yellow",
        "green",
        "teal",
        "blue",
        "indigo",
        "violet",
        "pink",
        "gray",
      ],
      width: "1/2",
    },
    size: {
      type: "select",
      tab: "choices",
      appearance: "list",
      options: [
        { value: "s", label: { en: "Small", de: "Klein" } },
        { value: "m", label: { en: "Medium", de: "Mittel" } },
        { value: "l", label: { en: "Large", de: "Groß" } },
      ],
      width: "1/2",
    },
    tags: {
      type: "select",
      tab: "choices",
      many: true,
      description: "Many values, as chips.",
      options: ["news", "guide", "release", "event", "tutorial", "opinion"],
    },
    channels: {
      type: "select",
      tab: "choices",
      many: true,
      appearance: "list",
      options: ["email", "push", "sms"],
      default: ["email"],
      width: "1/2",
    },
    days: {
      type: "select",
      tab: "choices",
      many: true,
      appearance: "buttons",
      options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      width: "1/2",
    },

    // Numbers and dates
    quantity: { type: "number", tab: "numbers", min: 0, max: 100, width: "1/3" },
    price: {
      type: "number",
      tab: "numbers",
      min: 0,
      step: 0.01,
      placeholder: "9.99",
      width: "1/3",
    },
    rating: {
      type: "custom:rating",
      tab: "numbers",
      description: "A custom field from the example plugin.",
      width: "1/3",
    },
    volume: {
      type: "number",
      tab: "numbers",
      appearance: "slider",
      min: 0,
      max: 10,
      step: 0.5,
      default: 5,
    },
    appointment: { type: "datetime", tab: "numbers", fieldset: "schedule", width: "1/2" },
    starts: { type: "date", tab: "numbers", fieldset: "schedule", width: "1/2" },
    ends: {
      type: "date",
      // tab: "numbers",
      width: "1/2",
      validate: (value, { siblingData }) =>
        !value ||
        !siblingData.starts ||
        value >= String(siblingData.starts) ||
        "Ends before it starts",
    },

    // Media and relations
    cover: {
      type: "image",
      tab: "media",
      localized: false,
      folder: "kitchen-sink",
      image: { sizes: [480, 960] },
      width: "1/2",
    },
    attachment: { type: "file", tab: "media", accept: ["application/pdf"], width: "1/2" },
    gallery: { type: "image", tab: "media", many: true, folder: "kitchen-sink" },
    author: { type: "relation", tab: "media", collection: "authors", width: "1/2" },
    posts: { type: "relation", tab: "media", collection: "posts", many: true, width: "1/2" },

    // Groups and lists
    meta: {
      type: "group",
      tab: "structure",
      label: "Meta",
      description: "A group with its own tab bar and fieldset.",
      tabs: { basic: { label: "Basic" }, social: { label: "Social", icon: "share-2" } },
      // fieldsets: { og: { label: "Open Graph" } },
      fields: {
        title: { type: "text", tab: "basic" },
        description: { type: "textarea", tab: "basic", maxLength: 160 },
        ogTitle: { type: "text", tab: "social", width: "1/2" },
        ogType: {
          type: "select",
          tab: "social",
          // fieldset: "og",
          options: ["website", "article"],
          width: "1/2",
          required: true,
        },
        ogImage: {
          type: "image",
          tab: "social",
          // fieldset: "og"
        },
      },
    },
    address: {
      type: "group",
      tab: "structure",
      description: "Nested groups.",
      fields: {
        street: { type: "text", width: "2/3" },
        zip: { type: "text", width: "1/3" },
        geo: {
          type: "group",
          fields: {
            lat: { type: "number", min: -90, max: 90, width: "1/2" },
            lng: { type: "number", min: -180, max: 180, width: "1/2" },
          },
        },
      },
    },
    links: {
      type: "array",
      tab: "structure",
      labels: { singular: "Link", plural: "Links" },
      maxRows: 5,
      fieldsets: { more: { label: "More", collapsible: true, collapsed: true } },
      fields: {
        label: { type: "text", required: true, width: "1/2" },
        url: { type: "text", required: true, pattern: "https?://.+", width: "1/2" },
        newTab: { type: "boolean", appearance: "switch", fieldset: "more", width: "1/2" },
        rel: { type: "select", options: ["nofollow", "sponsored"], fieldset: "more", width: "1/2" },
      },
    },
    sections: {
      type: "blocks",
      tab: "structure",
      labels: { singular: "Section", plural: "Sections" },
      blocks: {
        hero: {
          label: "Hero",
          description: "A block with tabs.",
          icon: "panel-top",
          tabs: { content: { label: "Content" }, style: { label: "Style" } },
          fields: {
            title: { type: "text", required: true, tab: "content" },
            image: { type: "image", tab: "content" },
            align: {
              type: "select",
              appearance: "buttons",
              options: ["left", "center", "right"],
              tab: "style",
            },
            dark: { type: "boolean", appearance: "switch", tab: "style" },
          },
        },
        quote: {
          label: "Quote",
          icon: "quote",
          fields: {
            text: { type: "textarea", required: true },
            by: { type: "text", width: "1/2" },
            role: { type: "text", width: "1/2" },
          },
        },
        cta: {
          label: "Call to action",
          icon: "mouse-pointer-click",
          fields: {
            label: { type: "text", required: true, width: "1/2" },
            href: { type: "text", required: true, width: "1/2" },
          },
        },
      },
    },
  },
});

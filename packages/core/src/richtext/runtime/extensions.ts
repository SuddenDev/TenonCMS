import { Extension, flattenExtensions, getSchema, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import type { RichtextRegistration } from "../config/types.ts";

/** Built-in feature names accepted by a field's `allowed` list. */
export const RICHTEXT_FEATURES = [
  "heading",
  "bold",
  "italic",
  "underline",
  "strike",
  "subscript",
  "superscript",
  "code",
  "codeBlock",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "horizontalRule",
  "textAlign",
  "color",
  "highlight",
  "table",
  "link",
  "image",
] as const;

const References = Extension.create({
  name: "cmsReferences",
  addGlobalAttributes() {
    return [
      {
        types: ["link", "image"],
        attributes: {
          reference: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              try {
                return JSON.parse(element.getAttribute("data-cms-reference") ?? "null");
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, any>) =>
              attrs.reference ? { "data-cms-reference": JSON.stringify(attrs.reference) } : {},
          },
          broken: { default: false, rendered: false },
        },
      },
      { types: ["image"], attributes: { srcset: { default: null } } },
    ];
  },
});

/** Builds the editor extensions, retaining the structural dependencies of allowed features. */
export function richtextExtensions(
  allowed?: readonly string[],
  extra: Record<string, Extensions> = {},
): Extensions {
  const on = (name: string) => !allowed || allowed.includes(name);
  // A filter, not a loop with an `if`: Nitro's Rolldown build folds that `if` and leaves a `for` without a body.
  const starter: Record<string, false> = Object.fromEntries(
    [
      "heading",
      "bold",
      "italic",
      "underline",
      "strike",
      "code",
      "codeBlock",
      "bulletList",
      "orderedList",
      "blockquote",
      "horizontalRule",
      "link",
    ]
      .filter((key) => !on(key))
      .map((key) => [key, false]),
  );

  if (!on("bulletList") && !on("orderedList")) starter.listItem = false;

  const extensions: Extensions = [
    StarterKit.configure({
      ...starter,
      link: on("link")
        ? {
            openOnClick: false,
            defaultProtocol: "https",
            HTMLAttributes: { target: "_self", rel: "noopener noreferrer" },
          }
        : false,
    }),
    References,
  ];

  if (on("subscript")) extensions.push(Subscript);
  if (on("superscript")) extensions.push(Superscript);
  if (on("color")) extensions.push(TextStyle, Color);
  if (on("textAlign")) extensions.push(TextAlign.configure({ types: ["heading", "paragraph"] }));
  if (on("highlight")) extensions.push(Highlight.configure({ multicolor: true }));
  if (on("table")) extensions.push(TableKit.configure({ table: { resizable: false } }));
  if (on("taskList")) extensions.push(TaskList, TaskItem.configure({ nested: true }));
  if (on("image")) extensions.push(Image);

  for (const [key, value] of Object.entries(extra)) if (on(key)) extensions.push(...value);

  const names = new Set<string>();

  for (const extension of flattenExtensions(extensions)) {
    if (names.has(extension.name))
      throw new Error(`tenoncms: duplicate Tiptap extension "${extension.name}"`);

    names.add(extension.name);
  }

  return extensions;
}

/** Builds a DOM-free schema from the same definitions the editor uses. */
export function richtextSchema(
  allowed?: readonly string[],
  registrations: Record<string, RichtextRegistration> = {},
) {
  return getSchema(
    richtextExtensions(
      allowed,
      Object.fromEntries(
        Object.entries(registrations).map(([key, value]) => [
          key,
          Array.isArray(value.schema) ? value.schema : [value.schema],
        ]),
      ),
    ),
  );
}

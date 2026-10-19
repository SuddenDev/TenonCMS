import type { Editor } from "@tiptap/core";

export type Control = {
  feature: string;
  icon: string;
  run(editor: Editor): boolean;
  active?: (editor: Editor) => boolean;
  can?: (editor: Editor) => boolean;
};
/** Toolbar actions use the same feature names as field restrictions. */
export const controls: Control[] = [
  ...["bold", "italic", "underline", "strike", "subscript", "superscript", "code"].map((name) => ({
    feature: name,
    icon: name === "strike" ? "strikethrough" : name,
    run: (e: Editor) => e.chain().focus().toggleMark(name).run(),
    active: (e: Editor) => e.isActive(name),
  })),
  {
    feature: "bulletList",
    icon: "list",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    feature: "orderedList",
    icon: "list-ordered",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    feature: "taskList",
    icon: "list-checks",
    run: (e) => e.chain().focus().toggleTaskList().run(),
    active: (e) => e.isActive("taskList"),
  },
  {
    feature: "blockquote",
    icon: "quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
  {
    feature: "codeBlock",
    icon: "square-code",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive("codeBlock"),
  },
  {
    feature: "horizontalRule",
    icon: "minus",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    feature: "highlight",
    icon: "highlighter",
    run: (e) => e.chain().focus().toggleHighlight({ color: "#fef08a" }).run(),
    active: (e) => e.isActive("highlight"),
  },
];

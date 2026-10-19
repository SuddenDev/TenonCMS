import type { Editor } from "@tiptap/core";
import type { RichtextDocument } from "../../../../../../../core/src/richtext/config/types";
import { richtextReferences } from "../../../../../../../core/src/richtext/runtime/walk";

/** Applies URL decoration to current content without replacing text, selection or undo history. */
export function decorateReferences(editor: Editor, document: RichtextDocument) {
  const decorations = new Map(
    richtextReferences(document).map(({ node, reference }) => [
      `${node.type}:${reference.collection}:${reference.id}`,
      node.attrs!,
    ]),
  );

  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    const attrs = (value: Record<string, any>, type: string) => {
      const ref = value.reference;
      const found = ref && decorations.get(`${type}:${ref.collection}:${ref.id}`);
      if (!found) return undefined;
      return {
        ...value,
        ...(type === "image" ? { src: found.src, srcset: found.srcset } : { href: found.href }),
        broken: found.broken,
      };
    };

    if (node.type.name === "image") {
      const updated = attrs(node.attrs, node.type.name);
      if (updated) tr.setNodeMarkup(pos, undefined, updated);
    }

    for (const mark of node.marks) {
      if (mark.type.name !== "link") continue;

      const updated = attrs(mark.attrs, mark.type.name);
      if (updated) tr.addMark(pos, pos + node.nodeSize, mark.type.create(updated));
    }
  });

  if (tr.docChanged)
    editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", true));
}

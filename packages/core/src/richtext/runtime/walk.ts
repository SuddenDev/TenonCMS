import type { RichtextNode, RichtextReference } from "../config/types.ts";

/** Visits nodes and marks in document order. */
export function walkRichtext(value: RichtextNode, visit: (node: RichtextNode) => void) {
  visit(value);

  for (const mark of value.marks ?? []) walkRichtext(mark, visit);

  for (const node of value.content ?? []) walkRichtext(node, visit);
}
/** Returns the nodes and marks that hold embedded CMS references. */
export function richtextReferences(value: RichtextNode) {
  const refs: { node: RichtextNode; reference: RichtextReference }[] = [];

  walkRichtext(value, (node) => {
    if (node.attrs?.reference) refs.push({ node, reference: node.attrs.reference });
  });

  return refs;
}
/** Removes read decoration before JSON is sent to a write pipeline. */
export function storedRichtext(value: RichtextNode) {
  const copy: RichtextNode = JSON.parse(JSON.stringify(value));

  walkRichtext(copy, (node) => {
    if (!node.attrs) return;

    delete node.attrs.broken;
    if (node.attrs.reference) {
      delete node.attrs.href;
      delete node.attrs.src;
      delete node.attrs.srcset;
    }
  });

  return copy;
}

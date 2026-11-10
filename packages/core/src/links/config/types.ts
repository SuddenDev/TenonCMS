import type { Text } from "../../admin/index.d.ts";

/** A CMS relation held by a link. `deleted` is owned by the server. */
export type LinkReference = { collection: string; id: string; deleted?: true };

/** What a link points to: a document with a `permalink`, a typed URL or a media file. */
export type LinkKind = "internal" | "external" | "file";

/** Where a link opens. The admin offers `_self` and `_blank`. */
export type LinkTarget = "_self" | "_blank" | "_parent" | "_top";

/**
 * The stored value of a `link` field: a reference to a document with a `permalink`, or a URL. `suffix` is appended to
 * the resolved `href`. It starts with `?` or `#` and replaces the query and fragment it covers.
 */
export type LinkValue = ({ reference: LinkReference } | { href: string }) & {
  target?: LinkTarget;
  suffix?: string;
};

/** What a link resolves to. `href` is `null` and `broken` is `true` for an unavailable target. */
export type LinkResolution = { href: string | null; title?: string; broken?: true };

/** A populated `link` field: the stored value with the target's `permalink` and title. */
export type LinkRead = LinkValue & LinkResolution;

/** Grouped results of the protected link target search. */
export type LinkTargets = {
  collection: string;
  label: Text;
  items: { id: string; label: string }[];
}[];

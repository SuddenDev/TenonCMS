import type { ActionDescriptor, ActionRegistration } from "../index.d.ts";
import { copyConfig, isObject, isText } from "./registration-checks.ts";

const DISPLAYS = ["main", "content"];

/**
 * Checks an action and splits it into the JSON descriptor and the server parts.
 * @throws If it is not an object, `label` or `confirm` is not a text, it has not exactly one of a `run` function and
 * an `http(s)` `href`, a link has `confirm`, or `nav.display` is not `main` or `content`.
 */
export function describeAction(key: string, value: unknown, source: string) {
  const path = `admin.actions.${key} in ${source}`;
  if (!isObject(value)) throw new Error(`tenoncms: ${path} MUST be an object`);
  const { label, nav, confirm, access, run, href } = value as ActionRegistration;
  if (!isText(label)) throw new Error(`tenoncms: ${path} MUST have a \`label\``);
  if (confirm !== undefined && !isText(confirm))
    throw new Error(`tenoncms: ${path} MUST use a text for \`confirm\``);
  if ((run === undefined) === (href === undefined))
    throw new Error(`tenoncms: ${path} MUST have either a \`run\` function or an \`href\``);
  if (run !== undefined && typeof run !== "function")
    throw new Error(`tenoncms: ${path} MUST use a function for \`run\``);
  if (href !== undefined && !(typeof href === "string" && /^https?:\/\//.test(href)))
    throw new Error(`tenoncms: ${path} MUST use an http or https URL for \`href\``);
  if (href !== undefined && confirm !== undefined)
    throw new Error(`tenoncms: ${path} MUST NOT use \`confirm\` with \`href\``);
  if (nav?.display !== undefined && !DISPLAYS.includes(nav.display))
    throw new Error(`tenoncms: ${path} MUST use \`nav.display\` "main" or "content"`);

  const descriptor: ActionDescriptor = { label: copyConfig(label, path) };
  if (nav) descriptor.nav = copyConfig(nav, path);
  if (confirm) descriptor.confirm = copyConfig(confirm, path);
  if (href) descriptor.href = href;
  return { descriptor, action: { source, access, run } };
}

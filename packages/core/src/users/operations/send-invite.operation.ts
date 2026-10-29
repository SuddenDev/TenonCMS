import { consola } from "consola";
import { translate } from "../../admin/browser/text.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { InviteRow } from "../../db/types.ts";
import { toInvite } from "../invite.ts";
import type { InviteResult } from "../types.ts";

/**
 * Emails an invite when email is configured. A failed send keeps the invite; the result then has `message`, and the
 * admin can pass on `link` by hand.
 */
export async function sendInvite(
  core: Core,
  inviter: CmsUser,
  row: InviteRow,
  link: string,
): Promise<InviteResult & { message?: string }> {
  const result = { invite: toInvite(row), link, sent: false };
  if (!core.emailTemplates) return result;
  const label = core.roles.find((r) => r.name === row.role)?.label;
  try {
    const content = await core.emailTemplates.invite({
      email: row.email,
      role: { name: row.role, label: translate(label, "en") ?? row.role },
      url: link,
      inviter: { name: inviter.name, email: inviter.email },
      site: core.admin.descriptor.name ?? "tenoncms",
    });
    await core.email.send({ ...content, to: row.email });
    return { ...result, sent: true };
  } catch (error) {
    consola.withTag("tenon").error("Sending an invite failed", error);
    return { ...result, message: "Sending the invite failed" };
  }
}

import { ValidationError } from "../errors.ts";

/**
 * The link of an invite: the admin's invite page with `?token=`. The page MUST be on the origin of `site`, or of the
 * request without `site`, so an invite never sends someone to another host.
 * @throws {ValidationError} For another origin or a URL that is not http(s).
 */
export function inviteLink(url: string, token: string, origin: string) {
  const page = URL.parse(url);
  if (!page || !/^https?:$/.test(page.protocol) || page.origin !== origin)
    throw new ValidationError({ url: `MUST be a page on ${origin}` });
  page.searchParams.set("token", token);
  return page.href;
}

// Runs in the admin and the site's preview runtime, so it MUST have no imports besides types.
import type { Logo, LogoPlace, Themed } from "../index.d.ts";

/** The logo one place shows. `undefined` means the place shows the icon and the name. */
export function logoAt(logo: Logo | undefined, place: LogoPlace): Themed | undefined {
  if (typeof logo === "string" || !logo || "light" in logo) return logo;
  return logo[place];
}

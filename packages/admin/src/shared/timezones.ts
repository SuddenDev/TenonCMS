/** The zone the device runs in. */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A zone the browser knows. Stored values MAY be stale or invalid, and `Intl` throws for them. */
export function validTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** `(GMT+1) Berlin`: the offset at `date` and the last part of the IANA name. */
export function timeZoneLabel(zone: string, date = new Date()) {
  // Engines print UTC as `GMT` or `GMT+0`.
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  return `(${offset === "GMT" ? "GMT+0" : offset}) ${zone.split("/").at(-1)!.replaceAll("_", " ")}`;
}

/** Every zone of the browser, grouped by the first part of its IANA name. */
export function timeZoneGroups(date = new Date()) {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const zone of Intl.supportedValuesOf("timeZone")) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push({ value: zone, label: timeZoneLabel(zone, date) });
  }
  return [...groups].map(([region, zones]) => ({ region, zones }));
}

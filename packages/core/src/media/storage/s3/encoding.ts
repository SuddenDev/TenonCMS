// S3 signs RFC 3986 paths, which also encode `!'()*`.
function rfc3986(s: string) {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A key as an S3 path: each segment RFC 3986 encoded. */
export function encodePath(key: string) {
  return key.split("/").map(rfc3986).join("/");
}

/** The text of the first `<name>` element of an S3 response, as is. */
export function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
}

/** Text for an XML request body. */
export function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The text of an XML element. `&amp;` goes last, so `&amp;lt;` reads as `&lt;`. */
export function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

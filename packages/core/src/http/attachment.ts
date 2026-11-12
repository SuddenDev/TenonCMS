/** A `content-disposition` value that downloads the response as `filename`, encoded for any character. */
export function attachment(filename: string) {
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

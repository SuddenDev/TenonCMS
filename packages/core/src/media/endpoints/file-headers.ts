// User files MAY be HTML or SVG. They MUST NOT run scripts on the host's origin.
export const SAFE = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

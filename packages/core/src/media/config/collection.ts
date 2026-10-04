/** The reserved collection of the media library. Written only through the media API. */
export const mediaCollection = {
  label: "Media",
  titleField: "filename",
  drafts: false,
  fields: {
    folder: { type: "text" },
    filename: { type: "text", required: true },
    key: { type: "text", required: true, readOnly: true },
    mimeType: { type: "text", required: true, readOnly: true },
    size: { type: "number", required: true, readOnly: true },
    width: { type: "number", readOnly: true },
    height: { type: "number", readOnly: true },
    alt: { type: "text" },
  },
} as const;

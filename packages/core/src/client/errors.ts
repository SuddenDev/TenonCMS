/** Thrown by client methods when the API answers with a non-2xx status. */
export class CmsError extends Error {
  constructor(
    /** HTTP status, e.g. `401` without a session or `400` for invalid data. */
    public status: number,
    /**
     * Parsed response body, if any. It has `message`. A `400` for invalid data also has `errors`: messages by field path.
     * A `409` for a blocked delete has `references`: the documents that point to it.
     */
    public body: any,
  ) {
    super(body?.message ?? `Request failed (${status})`);
  }
}

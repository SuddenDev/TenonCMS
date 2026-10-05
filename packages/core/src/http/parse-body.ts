/**
 * Parses a JSON request body. A malformed body reads as `undefined`, which then fails validation with 400.
 * @returns The parsed body, or `undefined`.
 */
export const parseBody = (req: { json(): Promise<any> }) => req.json().catch(() => undefined);

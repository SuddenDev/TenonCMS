// A malformed body reads as `undefined`, which fails validation with 400.
export const body = (req: { json(): Promise<any> }) => req.json().catch(() => undefined);

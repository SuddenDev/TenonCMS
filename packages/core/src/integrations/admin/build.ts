/** Name of the admin's client entry chunk. */
export const adminChunk = "tenon-admin";

/** Vite `configEnvironment` hook that adds the admin entry as a second client input. */
export function adminInput(entry: string) {
  return (name: string) =>
    name === "client"
      ? { build: { rolldownOptions: { input: { [adminChunk]: entry } } } }
      : undefined;
}

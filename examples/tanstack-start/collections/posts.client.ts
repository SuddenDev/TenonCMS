import type { FieldDescription } from "tenoncms/admin";

export const titleDescription: FieldDescription<string | null | undefined> = ({ value }) =>
  value ? `${value.length} characters` : "Give this post a title.";

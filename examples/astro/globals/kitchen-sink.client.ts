import type { FieldDescription } from "tenoncms/admin";

const approvalLimit = 1000;

export const priceDescription: FieldDescription<number | null | undefined> = ({ value }) =>
  (value ?? 0) > approvalLimit ? "Needs approval" : "Gross price";

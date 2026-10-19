import { shallowRef } from "vue";
import { CmsError } from "./api";
import type { DeleteOptions, LinkedReference } from "../../../core/src/errors";

export class DeletionCancelled extends Error {}
export const linkedDeletion = shallowRef<{
  references: LinkedReference[];
  finish(confirmed: boolean): void;
}>();

/** Retries only the server's explicit linked-content warning after the editor confirms. */
export async function withLinkedDeletion<T>(
  action: (options: DeleteOptions) => Promise<T>,
): Promise<T> {
  try {
    return await action({});
  } catch (error) {
    if (
      !(error instanceof CmsError) ||
      error.status !== 409 ||
      error.body?.code !== "LINKED_CONTENT"
    )
      throw error;

    linkedDeletion.value?.finish(false);
    const confirmed = await new Promise<boolean>((resolve) => {
      linkedDeletion.value = {
        references: error.body.references,
        finish: (value) => {
          linkedDeletion.value = undefined;
          resolve(value);
        },
      };
    });

    if (!confirmed) throw new DeletionCancelled();
    return action({ allowBrokenLinks: true });
  }
}

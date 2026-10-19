import { afterEach, expect, it, vi } from "vitest";
import { CmsError } from "./api";
import { DeletionCancelled, linkedDeletion, withLinkedDeletion } from "./linked-deletion";
const warning = () =>
  new CmsError(409, {
    code: "LINKED_CONTENT",
    references: [{ collection: "posts", id: "one", field: "body" }],
  });
afterEach(() => linkedDeletion.value?.finish(false));
it("retries with acknowledgement only after confirmation", async () => {
  const action = vi.fn().mockRejectedValueOnce(warning()).mockResolvedValueOnce("deleted");
  const result = withLinkedDeletion(action);
  await Promise.resolve();

  expect(linkedDeletion.value?.references).toHaveLength(1);
  expect(action).toHaveBeenCalledExactlyOnceWith({});

  linkedDeletion.value!.finish(true);

  await expect(result).resolves.toBe("deleted");
  expect(action).toHaveBeenLastCalledWith({ allowBrokenLinks: true });
});
it("cancels without another write and preserves ordinary conflicts", async () => {
  const action = vi.fn().mockRejectedValue(warning());
  const result = withLinkedDeletion(action);
  await Promise.resolve();
  linkedDeletion.value!.finish(false);

  await expect(result).rejects.toBeInstanceOf(DeletionCancelled);
  expect(action).toHaveBeenCalledTimes(1);
  await expect(
    withLinkedDeletion(() => Promise.reject(new CmsError(409, { references: [] }))),
  ).rejects.toMatchObject({ status: 409 });
  expect(linkedDeletion.value).toBeUndefined();
});

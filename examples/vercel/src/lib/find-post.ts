/** Loads the post at `slug` with what the post pages show. */
export const findPost = (cms: App.Locals["tenon"], slug: string) =>
  cms.findOne("posts", { where: { slug } });

export type Post = NonNullable<Awaited<ReturnType<typeof findPost>>>;

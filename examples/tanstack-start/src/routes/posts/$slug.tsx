import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import cms from "../../../integral.config";

const getPost = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await cms.findOne("posts", { where: { slug } });
    if (!post) throw notFound();
    return post;
  });

export const Route = createFileRoute("/posts/$slug")({
  loader: ({ params }) => getPost({ data: params.slug }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }] }),
  component: Post,
  notFoundComponent: () => <p>Post not found</p>,
});

function Post() {
  const post = Route.useLoaderData();
  return (
    <main>
      <Link to="/">← Home</Link>
      <h1
        style={post.color ? { borderLeft: `4px solid ${post.color}`, paddingLeft: 8 } : undefined}
      >
        {post.title}
      </h1>
      {post.publishedAt && <time dateTime={post.publishedAt}>{post.publishedAt}</time>}
      <p style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
    </main>
  );
}

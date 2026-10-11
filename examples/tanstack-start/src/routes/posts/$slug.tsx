import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { edit } from "integral-cms/preview";
import { useDraft } from "integral-cms/preview/react";
import cms from "../../../integral.config";

const getPost = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const api = await cms.withSession(getRequest());
    const post = await api.findOne("posts", { where: { slug } });
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
  const post = useDraft("posts", Route.useLoaderData());
  return (
    <main>
      <Link to="/">← Home</Link>
      <h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
      {post.publishedAt && <time dateTime={post.publishedAt}>{post.publishedAt}</time>}
      <p data-cms={edit("posts", post.id, "body")} style={{ whiteSpace: "pre-wrap" }}>
        {post.body}
      </p>
    </main>
  );
}

import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { edit } from "tenoncms/preview";
import { useDraft } from "tenoncms/preview/react";
import { Image, Richtext } from "tenoncms/react";
import cms from "../../../tenon.config";

const getPost = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    // The request's session and preview cookie, so the admin's preview sees drafts.
    const api = await cms.withSession(getRequest());
    const post = await api.findOne("posts", { where: { slug } });
    if (!post) throw notFound();
    return post;
  });

export const Route = createFileRoute("/posts/$slug")({
  loader: ({ params }) => getPost({ data: params.slug }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }] }),
  component: Post,
  notFoundComponent: () => <p className="wrap narrow">Post not found</p>,
});

function Post() {
  const post = useDraft("posts", Route.useLoaderData());
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return (
    <article className="wrap narrow">
      <header className="post-head">
        <Link className="back" to="/">
          ← All posts
        </Link>
        <h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
      </header>
      <Image
        image={post.image}
        className="post-image"
        sizes="(min-width: 768px) 688px, 100vw"
        loading="eager"
        fetchPriority="high"
        data-cms={edit("posts", post.id, "image")}
      />
      <div className="post-body">
        <div className="stack">
          <time className="date">{date}</time>
          <p className="hint">
            Edit <code className="chip">src/routes/posts/$slug.tsx</code> to change this page.
          </p>
        </div>
        <Richtext content={post.body} className="prose" data-cms={edit("posts", post.id, "body")} />
      </div>
    </article>
  );
}

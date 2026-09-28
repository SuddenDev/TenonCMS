import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import cms from "../../integral.config";

const getHome = createServerFn().handler(async () => ({
  site: await cms.getGlobal("site"),
  posts: await cms.find("posts"),
}));

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.site.title ?? "My site" }] }),
  component: Home,
});

function Home() {
  const { site, posts } = Route.useLoaderData();
  return (
    <main>
      <h1>{site.title ?? "My site"}</h1>
      {site.tagline && <p>{site.tagline}</p>}
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link to="/posts/$slug" params={{ slug: post.slug }}>
              {post.title}
            </Link>
            {post.featured && " ★"}
          </li>
        ))}
      </ul>
      <p>
        <a href="/admin">Admin</a>
      </p>
    </main>
  );
}

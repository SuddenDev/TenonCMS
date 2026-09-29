import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import cms from "../../integral.config";

const getHome = createServerFn().handler(async () => ({
  general: await cms.getGlobal("general"),
  posts: await cms.find("posts"),
}));

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.general.title ?? "My site" }] }),
  component: Home,
});

function Home() {
  const { general, posts } = Route.useLoaderData();
  return (
    <main>
      <h1>{general.title ?? "My site"}</h1>
      {general.tagline && <p>{general.tagline}</p>}
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

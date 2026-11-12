import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { edit } from "tenoncms/preview";
import cms from "../../tenon.config";

const getPosts = createServerFn().handler(() => cms.find("posts"));

export const Route = createFileRoute("/")({
  loader: () => getPosts(),
  component: Home,
});

function Home() {
  const posts = Route.useLoaderData();
  return (
    <main>
      <h1>Posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              to="/posts/$slug"
              params={{ slug: post.slug }}
              data-cms={edit("posts", post.id, "title")}
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <a href="/admin">Admin</a>
      </p>
    </main>
  );
}

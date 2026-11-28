import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { edit } from "tenoncms/preview";
import cms from "../../tenon.config";

// The newest posts come first.
const getPosts = createServerFn().handler(() => cms.find("posts"));

export const Route = createFileRoute("/")({
  loader: () => getPosts(),
  head: () => ({ meta: [{ title: "Welcome to Tenon" }] }),
  component: Home,
});

const date = (value: string) =>
  new Date(value).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });

function Home() {
  const posts = Route.useLoaderData();
  return (
    <main className="wrap">
      <section className="hero">
        <h1>Welcome to Tenon</h1>
        <p className="intro">
          This page reads the posts collection. Add a post in the admin, reload, and the count below
          goes up.
        </p>
        <div className="actions">
          <a className="button" href="/admin">
            Open the admin
          </a>
          <a href="https://tenoncms.com/docs">Read the docs</a>
        </div>
        <p className="hint">
          Edit <code className="chip">src/routes/index.tsx</code> and save to see this page change.
        </p>
      </section>

      <section className="section">
        <div className="split">
          <div className="stack">
            <p className="count">{posts.length}</p>
            <p className="label">
              {posts.length === 1 ? "Post" : "Posts"} in the <code className="chip">posts</code>{" "}
              collection
            </p>
            <p className="muted">
              Read with <code>cms.find("posts")</code>
            </p>
          </div>
          {posts.length > 0 ? (
            <ul className="rows posts">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link to="/posts/$slug" params={{ slug: post.slug }}>
                    <strong data-cms={edit("posts", post.id, "title")}>{post.title}</strong>
                    <time className="date">{date(post.publishedAt ?? post.createdAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <p className="label">No posts yet.</p>
              <p className="muted">Sign in, write the first one and reload this page.</p>
              <a href="/admin">Write a post</a>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="split">
          <div className="stack">
            <h2>Make it yours</h2>
            <p className="muted">Change these files. The page reloads on save.</p>
          </div>
          <ul className="rows">
            <li>
              <code className="chip">cms/collections/posts.ts</code>
              <span>
                The fields of a post: a title, an image and the text. Add one, and the admin shows
                it after a reload.
              </span>
            </li>
            <li>
              <code className="chip">src/routes/index.tsx</code>
              <span>This page and how it reads the posts.</span>
            </li>
            <li>
              <code className="chip">src/routes/posts/$slug.tsx</code>
              <span>The page of one post, with its image and text.</span>
            </li>
            <li>
              <code className="chip">tenon.config.ts</code>
              <span>The collections, the database, media and sign-in.</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

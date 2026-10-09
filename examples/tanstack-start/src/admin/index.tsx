import type { FieldContext, PageContext } from "integral-cms/admin";
import { renderReact } from "integral-cms/admin/react";
import { createClient } from "integral-cms/client";
import { useEffect, useState } from "react";
import type { Doc } from "integral-cms";
import type { posts } from "../../collections/posts";

const client = createClient();
type Post = Doc<typeof posts.fields>;

export function ColorInput({ value, onChange }: FieldContext) {
  return (
    <input type="color" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} />
  );
}

export function Stats({ integral }: PageContext) {
  const [posts, setPosts] = useState<Post[]>();
  useEffect(() => {
    client.find("posts").then(setPosts);
  }, []);
  return (
    <>
      <h1 className="text-2xl font-semibold">Stats</h1>
      <p className="mt-2 text-sm text-zinc-600">{posts?.length ?? "…"} post(s)</p>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {posts?.map((post) => (
          <li key={post.id}>
            <a href={`${integral.base}/reports/posts/${post.id}?tab=body`} className="underline">
              {post.title}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

// Re-rendered by `renderReact` on every route change, so the effect refetches when `:id` changes.
export function PostReport({ params, query }: PageContext) {
  const [post, setPost] = useState<Post>();
  useEffect(() => {
    client.findById("posts", String(params.id)).then(setPost);
  }, [params.id]);
  return (
    <>
      <h1 className="text-2xl font-semibold">{post?.title ?? "…"}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        id {params.id}, tab {query.tab ?? "none"}
      </p>
      {query.tab === "body" && <pre className="mt-4 text-sm">{post?.body}</pre>}
    </>
  );
}

// Browser exports. `admin.ts` names them with `clientRef()`; the server config never imports this file.
export const mountColor = renderReact(ColorInput);
export const mountStats = renderReact(Stats);
export const mountPostReport = renderReact(PostReport);

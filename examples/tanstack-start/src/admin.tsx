import type { FieldContext, PageContext } from 'integral-cms/admin'
import { useEffect, useState } from 'react'

type Post = { id: string; title: string; body?: string }

export function ColorInput({ value, onChange }: FieldContext) {
  return <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
}

export function Stats({ api }: PageContext) {
  const [posts, setPosts] = useState<Post[]>()
  useEffect(() => {
    api<Post[]>('/collections/posts').then(setPosts)
  }, [api])
  return (
    <>
      <h1 className="text-2xl font-semibold">Stats</h1>
      <p className="mt-2 text-sm text-zinc-600">{posts?.length ?? '…'} post(s)</p>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {posts?.map((post) => (
          <li key={post.id}>
            <a href={`/admin/reports/posts/${post.id}?tab=body`} className="underline">
              {post.title}
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

// Re-rendered by `renderReact` on every route change, so the effect refetches when `:id` changes.
export function PostReport({ api, params, query }: PageContext) {
  const [post, setPost] = useState<Post>()
  useEffect(() => {
    api<Post>(`/collections/posts/${params.id}`).then(setPost)
  }, [api, params.id])
  return (
    <>
      <h1 className="text-2xl font-semibold">{post?.title ?? '…'}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        id {params.id}, tab {query.tab ?? 'none'}
      </p>
      {query.tab === 'body' && <pre className="mt-4 text-sm">{post?.body}</pre>}
    </>
  )
}

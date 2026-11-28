import Link from "next/link";
import { cmsClient } from "@/lib/cms";

export default async function Home() {
  const cms = await cmsClient();
  const posts = await cms.find("posts", { select: { title: true, slug: true } });

  return (
    <main>
      <h1>Posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={`/posts/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

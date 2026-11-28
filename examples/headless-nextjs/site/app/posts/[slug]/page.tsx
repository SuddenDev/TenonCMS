import { notFound } from "next/navigation";
import { edit } from "tenoncms/preview";
import { Image } from "tenoncms/react";
import { cmsClient } from "@/lib/cms";

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cms = await cmsClient();
  const post = await cms.findOne("posts", { where: { slug } });
  if (!post) notFound();

  return (
    <main>
      <h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
      <Image
        image={post.cover}
        data-cms={edit("posts", post.id, "cover")}
        sizes="(min-width: 720px) 720px, 100vw"
      />
      <p data-cms={edit("posts", post.id, "body")}>{post.body}</p>
    </main>
  );
}

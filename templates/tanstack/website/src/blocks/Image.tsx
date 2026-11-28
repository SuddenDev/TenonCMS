import { Image as CmsImage } from "tenoncms/react";
import type { BlockProps } from "./types";

export function Image({ block, edit }: BlockProps<"image">) {
  return (
    <figure className="wrap figure">
      <CmsImage
        image={block.image}
        sizes="(min-width: 1200px) 1120px, 100vw"
        data-cms={edit("image")}
      />
      {block.caption && <figcaption data-cms={edit("caption")}>{block.caption}</figcaption>}
    </figure>
  );
}

import { createIPX, type IPX } from "ipx";
import { API_BASE } from "../../client/index.ts";
import { modifierId } from "./modifiers.ts";
import type { ImageProvider } from "./types.ts";
import { encodeKey, type Storage } from "../storage/types.ts";

/** Options of `ipx()`. */
export type IpxOptions = {
  /** Render every allowed variant right after upload, instead of on first request. Default `false`. */
  prerender?: boolean;
};

const instances = new WeakMap<Storage, IPX>();

// One IPX instance per storage. IPX ids start with `/`; keys do not.
function ipxOf(storage: Storage) {
  let instance = instances.get(storage);
  if (!instance) {
    instance = createIPX({
      storage: {
        name: "integral",
        getMeta: () => ({}),
        async getData(id) {
          const file = await storage.get(id.replace(/^\//, ""));
          return file && (await new Response(file.body).arrayBuffer());
        },
      },
    });
    instances.set(storage, instance);
  }
  return instance;
}

/**
 * Image variants rendered by IPX (sharp) and served by core at `/api/cms/media/img/<modifiers>/<key>`, stored under
 * `.variants/` after the first request. Needs `ipx` installed and a runtime where sharp works (Node, Bun).
 */
export function ipx({ prerender = false }: IpxOptions = {}): ImageProvider {
  return {
    prerender,
    getImage: ({ key }, modifiers) => ({
      url: `${API_BASE}/media/img/${modifierId(modifiers)}/${encodeKey(key)}`,
    }),
    async render(key, modifiers, storage) {
      const { data, format } = await ipxOf(storage)(
        key,
        modifiers as Record<string, string>,
      ).process();
      const bytes =
        typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
      const type = format === "svg" ? "svg+xml" : format === "jpg" ? "jpeg" : format;
      return { data: bytes, mimeType: type ? `image/${type}` : "application/octet-stream" };
    },
  };
}

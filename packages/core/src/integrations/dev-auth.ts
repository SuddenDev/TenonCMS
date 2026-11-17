import type { AddressInfo } from "node:net";
import type { Plugin } from "vite";

export function developmentOrigin(
  address: AddressInfo,
  https = false,
  host?: string | boolean,
): string {
  let hostname = typeof host === "string" ? host : address.address;
  if (["0.0.0.0", "::", "[::]"].includes(hostname)) hostname = "localhost";
  if (hostname.includes(":") && !hostname.startsWith("[")) hostname = `[${hostname}]`;
  return `${https ? "https" : "http"}://${hostname}:${address.port}`;
}

/** Adapters MUST supply the public listener's origin when Vite runs in middleware mode. */
export function developmentAuth(host?: string | boolean): Plugin {
  return {
    name: "tenoncms:dev-auth",
    apply: "serve",
    config(config) {
      const hostname = host ?? config.server?.host;
      return {
        define: {
          "import.meta.env.TENON_DEV_HOST": JSON.stringify(
            typeof hostname === "string" ? hostname : "",
          ),
        },
      };
    },
    configureServer(server) {
      server.httpServer?.on("listening", () => {
        const address = server.httpServer?.address();
        if (address && typeof address !== "string")
          process.env.__TENON_DEV_ORIGIN = developmentOrigin(
            address,
            !!server.config.server.https,
            server.config.server.host,
          );
      });
    },
  };
}

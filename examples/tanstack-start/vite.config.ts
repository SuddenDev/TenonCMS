import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { tenonAdmin } from "tenoncms/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact(), tenonAdmin()],
});

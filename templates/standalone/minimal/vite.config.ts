import { tenonAdmin } from "tenoncms/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [nitro(), tenonAdmin()],
});

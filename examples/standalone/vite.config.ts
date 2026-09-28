import { integralAdmin } from "integral-cms/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [nitro(), integralAdmin()],
});

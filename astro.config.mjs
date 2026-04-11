import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://imotistatistica.com",
  integrations: [sitemap()],

  build: {
    assets: "assets",
  },

  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },

  adapter: cloudflare()
});
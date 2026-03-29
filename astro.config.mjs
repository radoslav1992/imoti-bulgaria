import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://imoti-bulgaria.pages.dev",
  integrations: [sitemap()],
  build: {
    assets: "assets",
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});

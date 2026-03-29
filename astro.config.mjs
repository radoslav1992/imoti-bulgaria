import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://your-domain.com",
  build: {
    assets: "assets",
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});

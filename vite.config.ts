import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: [
      {
        // Monaco vendors DOMPurify: a package override alone does not patch
        // its editor hover/Markdown renderer. Use our audited dependency.
        find: "./dompurify/dompurify.js",
        replacement: fileURLToPath(
          new URL(
            "./node_modules/dompurify/dist/purify.es.mjs",
            import.meta.url,
          ),
        ),
      },
    ],
  },
});

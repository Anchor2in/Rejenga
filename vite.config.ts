import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// The dev server serves project files as static assets; keep private photos, model weights and training data out of it.
const privateDirs = (): Plugin => ({
  name: "rejenga-private-dirs",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/^\/(uploads|models|ai-data)(\/|$)/.test(req.url ?? "")) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  resolve: { tsconfigPaths: true },
  ssr: { external: ["@huggingface/transformers", "sharp", "onnxruntime-node", "bcryptjs", "postgres"] },
  plugins: [privateDirs(), tailwindcss(), tanstackStart({ srcDirectory: "src" }), viteReact(), nitro()],
});

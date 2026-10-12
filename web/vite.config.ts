import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "runtime-deployment-for-development",
      configureServer(server) {
        server.middlewares.use("/imd-deployment.json", (_request, response) => {
          try {
            response.setHeader("Content-Type", "application/json");
            response.end(
              readFileSync(
                new URL("../dist/imd-deployment.json", import.meta.url),
              ),
            );
          } catch {
            response.statusCode = 503;
            response.end("Run npm run build before starting development.");
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 750,
  },
});

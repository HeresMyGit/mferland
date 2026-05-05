import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

export default defineConfig({
  plugins: [react(), mferLayerAssets()],
  envDir: "../..",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});

const MFER_LAYER_ROOTS = [
  {
    urlPrefix: "/mfer-layers/og/",
    directory: "/Users/mfergpt/.openclaw/workspace/data/mfer-layers",
  },
  {
    urlPrefix: "/mfer-layers/extended/",
    directory: "/Users/mfergpt/.openclaw/workspace/data/mfer-layers-extended",
  },
];

function mferLayerAssets(): Plugin {
  return {
    name: "mfer-layer-assets",
    configureServer(server) {
      server.middlewares.use(serveMferLayerAsset);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveMferLayerAsset);
    },
  };
}

function serveMferLayerAsset(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const root = MFER_LAYER_ROOTS.find((entry) => pathname.startsWith(entry.urlPrefix));
  if (!root || !existsSync(root.directory)) {
    next();
    return;
  }

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname.slice(root.urlPrefix.length));
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }

  const directory = path.resolve(root.directory);
  const filePath = path.resolve(directory, relativePath);
  if (filePath !== directory && !filePath.startsWith(`${directory}${path.sep}`)) {
    res.statusCode = 403;
    res.end();
    return;
  }

  try {
    if (!statSync(filePath).isFile()) {
      next();
      return;
    }
  } catch {
    next();
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-type", "image/png");
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

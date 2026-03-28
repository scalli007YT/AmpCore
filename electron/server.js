/**
 * server.js — Next.js production server running in a child process.
 *
 * Forked by electron/main.js so that the heavy require("next") + prepare()
 * never blocks the main Electron process. Sends IPC "ready" once the
 * HTTP server is listening.
 *
 * Receives from parent:
 *   { type: "start", appRoot: string, port: number, userData: string }
 *
 * Sends to parent:
 *   { type: "ready" }
 *   { type: "error", message: string }
 */

process.on("message", async (msg) => {
  if (msg.type !== "start") return;

  const { appRoot, port, userData } = msg;

  try {
    // Make userData available to API routes
    process.env.APP_USER_DATA = userData;

    const path = require("path");
    const http = require("http");
    const next = require(path.join(appRoot, "node_modules", "next"));

    const app = next({ dev: false, dir: appRoot, port, hostname: "127.0.0.1" });
    const handle = app.getRequestHandler();

    await app.prepare();

    await new Promise((resolve, reject) => {
      http
        .createServer((req, res) => handle(req, res))
        .listen(port, "127.0.0.1", (err) => {
          if (err) reject(err);
          else resolve();
        });
    });

    process.send({ type: "ready" });
  } catch (err) {
    console.error("[next] Server failed to start:", err);
    process.send({ type: "error", message: err.message });
  }
});

import http from "node:http";
import { Logger } from "./logger";

export function startHealthServer(port: number, logger: Logger) {
  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (req.url.startsWith("/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info("Health server listening", { port });
  });
  server.on("error", (err) => logger.error("Health server error", err));

  return server;
}

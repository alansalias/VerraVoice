"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHealthServer = startHealthServer;
const node_http_1 = __importDefault(require("node:http"));
function startHealthServer(port, logger) {
    const server = node_http_1.default.createServer((req, res) => {
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

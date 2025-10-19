"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/index.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_http_1 = require("node:http");
const ws_1 = require("ws");
const api_js_1 = require("./api.js");
const ws_js_1 = require("./ws.js");
const store_js_1 = require("./store.js");
const events_js_1 = require("./events.js"); // ← NEW: SSE
const PORT = Number(process.env.PORT ?? 8000);
const ORIGIN = process.env.CORS_ORIGIN ?? "*";
async function main() {
    (0, store_js_1.initDB)(); // init db.json
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({ origin: ORIGIN, credentials: true }));
    app.use("/api", api_js_1.api);
    // SSE: /api/events?roleId=xxx
    app.get("/api/events", (req, res) => {
        const roleId = String(req.query.roleId ?? "");
        if (!roleId)
            return res.status(400).json({ error: "roleId required" });
        (0, events_js_1.subscribe)(roleId, res);
    });
    // Root
    app.get("/", (_req, res) => res.send("NudgeeQ server OK"));
    const server = (0, node_http_1.createServer)(app);
    // WebSocket: /ws?userId=xxx
    const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
    (0, ws_js_1.setupWS)(wss);
    server.listen(PORT, () => {
        console.log(`[http] http://localhost:${PORT}`);
        console.log(`[ws]   ws://localhost:${PORT}/ws?userId=YOUR_ID`);
        console.log(`[sse]  GET /api/events?roleId=YOUR_ID`);
    });
}
main();

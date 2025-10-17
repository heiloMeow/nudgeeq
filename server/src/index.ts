// server/src/index.ts
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { api } from "./api.js";
import { setupWS } from "./ws.js";
import { initDB } from "./store.js";
import { subscribe } from "./events.js"; // ← NEW: SSE

const PORT = Number(process.env.PORT ?? 8000);
const ORIGIN = process.env.CORS_ORIGIN ?? "*";

async function main() {
  initDB(); // init db.json

  const app = express();
  app.use(cors({ origin: ORIGIN, credentials: true }));
  app.use("/api", api);

  // SSE: /api/events?roleId=xxx
  app.get("/api/events", (req, res) => {
    const roleId = String(req.query.roleId ?? "");
    if (!roleId) return res.status(400).json({ error: "roleId required" });
    subscribe(roleId, res);
  });

  // Root
  app.get("/", (_req, res) => res.send("NudgeeQ server OK"));

  const server = createServer(app);

  // WebSocket: /ws?userId=xxx
  const wss = new WebSocketServer({ server, path: "/ws" });
  setupWS(wss);

  server.listen(PORT, () => {
    console.log(`[http] http://localhost:${PORT}`);
    console.log(`[ws]   ws://localhost:${PORT}/ws?userId=YOUR_ID`);
    console.log(`[sse]  GET /api/events?roleId=YOUR_ID`);
  });
}

main();

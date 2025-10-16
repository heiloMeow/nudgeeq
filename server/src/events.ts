// server/src/events.ts
import type { Response } from "express";

type Sub = { res: Response; roleId: string; alive: boolean; lastBeat: number };
const subs = new Map<string, Set<Sub>>(); // roleId -> set of connections

export function subscribe(roleId: string, res: Response) {
  const s: Sub = { res, roleId, alive: true, lastBeat: Date.now() };
  if (!subs.has(roleId)) subs.set(roleId, new Set());
  subs.get(roleId)!.add(s);

  // 基本 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 心跳
  const timer = setInterval(() => {
    if (!s.alive) return clearInterval(timer);
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {
      s.alive = false;
      subs.get(roleId)?.delete(s);
      clearInterval(timer);
    }
  }, 15000);

  reqOnClose(res, () => {
    s.alive = false;
    subs.get(roleId)?.delete(s);
    clearInterval(timer);
  });
}

export function publish(toRoleId: string, event: string, payload: unknown) {
  const set = subs.get(toRoleId);
  if (!set || set.size === 0) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const s of set) {
    if (!s.alive) continue;
    try { s.res.write(data); } catch { s.alive = false; }
  }
}

function reqOnClose(res: Response, cb: () => void) {
  // @ts-ignore
  res.on("close", cb);
}

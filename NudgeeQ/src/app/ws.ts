import type { Incoming, Outgoing } from "./types";

let socket: WebSocket | null = null;
const listeners = new Set<(msg: Incoming) => void>();

export function connect(wssUrl: string) {
  if (socket && socket.readyState <= 1) return socket;
  socket = new WebSocket(wssUrl);
  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      listeners.forEach(fn => fn(data));
    } catch {}
  };
  return socket;
}

// ✅ 明确声明返回 () => void，且包装 delete，保证返回值为 void
export function onMessage(cb: (msg: Incoming) => void): () => void {
  listeners.add(cb);
  return () => {            // ← 清理函数
    listeners.delete(cb);   // delete 返回 boolean，但这里不把它当返回值
  };
}
export function send(msg: Outgoing) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(msg));
}

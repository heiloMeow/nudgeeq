const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
import { useEffect } from "react";
export type PushMessage = {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  text: string;
  kind: "request" | "response";
  inReplyTo?: string;
  createdAt: string;
  dir: "in" | "out"; // 服务端 publish 附带
};

export function useEventStream(
  roleId: string | undefined,
  onMessage: (m: PushMessage) => void
) {
  useEffect(() => {
    if (!roleId) return;
    const url = `${API_BASE}/events?roleId=${encodeURIComponent(roleId)}`;
    const es = new EventSource(url);

    es.addEventListener("message", (ev: any) => {
      try {
        const data = JSON.parse(ev.data) as PushMessage;
        onMessage(data);
      } catch {}
    });
    es.addEventListener("ping", () => { /* keepalive */ });

    return () => es.close();
  }, [roleId, onMessage]);
}

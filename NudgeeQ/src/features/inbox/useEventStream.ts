// src/features/inbox/useEventStream.ts
import { useEffect, useRef } from "react";

export type PushMessage = {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  text: string;
  kind: "request" | "response";
  inReplyTo?: string;
  createdAt: string;
  dir: "in" | "out"; // server-attached direction
  // Optional metadata (if server includes them)
  fromRoleName?: string;
  fromTableId?: string | number;
  fromSeatId?: number | string;
};

// Resolve SSE base URL:
// 1) prefer VITE_SSE_URL (e.g., "/api/events")
// 2) else derive from VITE_API_BASE_URL by appending "/events" (if it ends with /api) or "/api/events"
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
const SSE_BASE =
  import.meta.env.VITE_SSE_URL ??
  (API_BASE.endsWith("/api") ? `${API_BASE}/events` : `${API_BASE}/api/events`);

export function useEventStream(
  roleId: string | undefined,
  onMessage: (m: PushMessage) => void
) {
  // keep a stable callback without re-opening the stream
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roleId) return;

    const url = `${SSE_BASE}?roleId=${encodeURIComponent(roleId)}`;
    let es: EventSource | null = null;

    try {
      // If you need cookies across origins, use: new EventSource(url, { withCredentials: true })
      es = new EventSource(url);
    } catch {
      return;
    }

    const handleMessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as PushMessage;
        onMessageRef.current?.(data);
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("message", handleMessage);
    es.addEventListener("ping", () => {
      // keepalive
    });
    es.addEventListener("error", () => {
      // let the browser auto-reconnect; server can send "retry:" to tune backoff
    });

    return () => {
      es?.removeEventListener("message", handleMessage);
      es?.close();
    };
  }, [roleId]);
}

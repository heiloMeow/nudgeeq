// src/features/inbox/useIncomingRequests.ts
import { useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export type IncomingItem = {
  id: string;
  text: string;
  createdAt: string;
  from: { id: string; name: string };
};

export function useIncomingRequests(
  myRoleId: string | undefined,
  onNew: (item: IncomingItem) => void,
  opts?: { intervalMs?: number }
) {
  const interval = Math.max(2500, opts?.intervalMs ?? 4000);
  const lastCursorRef = useRef<string | undefined>(undefined);
  const running = useRef(false);

  useEffect(() => {
    if (!myRoleId) return;
    let timer: any;
    running.current = true;

    async function tick() {
      try {
        const url = new URL(`${API_BASE}/roles/${encodeURIComponent(myRoleId)}/messages/received`);
        url.searchParams.set("limit", "1");
        if (lastCursorRef.current) url.searchParams.set("cursor", lastCursorRef.current);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { items: IncomingItem[]; nextCursor?: string } = await res.json();

        // keyset 游标：有数据就触发
        if (data.items?.length) {
          // 因为是倒序返回，取第 0 条即最新
          const newest = data.items[0];
          onNew(newest);
          // 下次从“最新”的下一条开始
          lastCursorRef.current = `${newest.createdAt}_${newest.id}`;
        } else if (data.nextCursor) {
          lastCursorRef.current = data.nextCursor;
        }
      } catch {
        // 静默失败，等下次轮询
      } finally {
        if (running.current) timer = setTimeout(tick, interval);
      }
    }

    // 第一次拉取时不带 cursor，相当于只把“当前最新位置”记下来，不弹历史
    (async () => {
      try {
        const url = new URL(`${API_BASE}/roles/${encodeURIComponent(myRoleId)}/messages/received`);
        url.searchParams.set("limit", "1");
        const res = await fetch(url.toString());
        if (res.ok) {
          const data: { items: IncomingItem[] } = await res.json();
          if (data.items?.length) {
            const newest = data.items[0];
            lastCursorRef.current = `${newest.createdAt}_${newest.id}`;
          }
        }
      } finally {
        tick();
      }
    })();

    return () => {
      running.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [myRoleId, interval, onNew]);
}

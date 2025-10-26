// src/features/inbox/useIncomingRequests.ts
import { useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export type IncomingItem = {
  id: string;
  text: string;
  createdAt: string; // ISO
  from: { id: string; name: string; tableId?: string; seatId?: number };
};

type Options = {
  /** 轮询基础间隔（ms），默认 4000，最小 2500 */
  intervalMs?: number;
  /** 错误后的最大退避间隔（ms），默认 20000 */
  backoffMaxMs?: number;
  /** 页面隐藏时是否降频（true=按 3 倍降频），默认 true */
  pauseWhenHidden?: boolean;
  /** 可选：错误回调（静默失败已内置） */
  onError?: (err: unknown) => void;
};

/**
 * 轮询「发给我的消息」的最新一条，用 keyset 游标避免重复。
 * 初次挂载：只对齐最新游标，不触发 onNew（不打扰）。
 */
export function useIncomingRequests(
  myRoleId: string | undefined,
  onNew: (item: IncomingItem) => void,
  opts: Options = {}
) {
  const intervalBase = Math.max(2500, opts.intervalMs ?? 4000);
  const backoffMax = opts.backoffMaxMs ?? 20000;
  const pauseWhenHidden = opts.pauseWhenHidden ?? true;

  // 最近一次“已消费到”的游标：`${createdAt}_${id}`
  const lastCursorRef = useRef<string | undefined>(undefined);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const backoffRef = useRef<number>(intervalBase);

  // 保持 onNew 最新引用，避免依赖变化导致重启整个 effect
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  useEffect(() => {
    // 没有我的角色 id，直接停
    if (!myRoleId) return;
    const roleId = myRoleId; 
    runningRef.current = true;
    backoffRef.current = intervalBase; // 重置退避
    // 每次角色切换都重置游标，避免串号
    lastCursorRef.current = undefined;

    const schedule = (ms: number) => {
      if (!runningRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, ms);
    };

    const nextInterval = (ok: boolean) => {
      // 页面隐藏时降频（若开启）
      const hiddenFactor =
        pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden"
          ? 3
          : 1;

      if (ok) {
        backoffRef.current = intervalBase; // 成功重置退避
        return intervalBase * hiddenFactor;
      } else {
        // 指数退避：1.7 倍到上限
        const next = Math.min(Math.ceil(backoffRef.current * 1.7), backoffMax);
        backoffRef.current = next;
        return next * hiddenFactor;
      }
    };

    async function tick() {
      if (!runningRef.current) return;

      try {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const url = new URL(
          `${API_BASE}/roles/${encodeURIComponent(roleId)}/messages/received`
        );
        url.searchParams.set("limit", "1");
        if (lastCursorRef.current) url.searchParams.set("cursor", lastCursorRef.current);

        const res = await fetch(url.toString(), { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { items: IncomingItem[]; nextCursor?: string } = await res.json();

        // 有新数据：触发回调，并推进游标到“最新”的下一条
        if (Array.isArray(data.items) && data.items.length) {
          const newest = data.items[0]; // 按 createdAt DESC
          onNewRef.current(newest);
          lastCursorRef.current = `${newest.createdAt}_${newest.id}`;
          schedule(nextInterval(true));
          return;
        }

        // 没新数据但返回了 nextCursor：对齐游标
        if (data.nextCursor) {
          lastCursorRef.current = data.nextCursor;
        }
        schedule(nextInterval(true));
      } catch (err) {
        // 中止不算错误
        if ((err as any)?.name === "AbortError") return;
        opts.onError?.(err);
        schedule(nextInterval(false));
      }
    }

    // 初次对齐：不带 cursor 拉一次，只记录“最新游标”，不触发 onNew
    (async () => {
      try {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const url = new URL(
          `${API_BASE}/roles/${encodeURIComponent(roleId)}/messages/received`
        );
        url.searchParams.set("limit", "1");
        const res = await fetch(url.toString(), { signal: ac.signal });
        if (res.ok) {
          const data: { items: IncomingItem[] } = await res.json();
          if (Array.isArray(data.items) && data.items.length) {
            const newest = data.items[0];
            lastCursorRef.current = `${newest.createdAt}_${newest.id}`;
          }
        }
      } catch {
        /* 静默，等定时器下一轮 */
      } finally {
        schedule(intervalBase);
      }
    })();

    // 页面可见性变更时，立刻重置为基础间隔（可选优化）
    const onVis = () => {
      if (!runningRef.current) return;
      schedule(intervalBase);
    };
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }

    // 清理
    return () => {
      runningRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      if (pauseWhenHidden && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [myRoleId, intervalBase, backoffMax, pauseWhenHidden, opts.onError]);
}

// src/features/inbox/IncomingRequestGate.tsx
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../app/store";
import { useEventStream, type PushMessage } from "./useEventStream";
import { IncomingModal } from "./IncomingModal";
import { useToasts } from "./Toasts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

const REPLY_SORRY = "Sorry, I can’t help right now.";
const REPLY_SURE  = "Sure, I’m on my way.";

// 离线拉取时用到的宽松类型
type MsgKind = "request" | "response";
type AnyMsg = {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  text: string;
  createdAt: string;
  kind?: MsgKind;
  inReplyTo?: string;
};

export default function IncomingRequestGate() {
  const { user } = useApp();
  const myRoleId = user?.id || "";

  const [queue, setQueue] = useState<PushMessage[]>([]);
  const [sending, setSending] = useState(false);
  const { addToast, renderer: ToastRenderer } = useToasts();

  /* ---------------- 实时推送 ---------------- */
  const onPush = useCallback(
    (m: PushMessage) => {
      if (!myRoleId || m.toRoleId !== myRoleId) return;

      if ((m.kind ?? "request") === "request") {
        setQueue((q) => (q.some((x) => x.id === m.id) ? q : [...q, m]));
        bumpLastSeen(myRoleId, m.createdAt);
      } else {
        addToast({ text: m.text, fromRoleId: m.fromRoleId });
      }
    },
    [myRoleId, addToast]
  );

  useEventStream(myRoleId, onPush);

  /* ---------------- 离线补拉：登录/刷新时补齐未处理请求 ---------------- */
  useEffect(() => {
    if (!myRoleId) return;

    (async () => {
      try {
        const last = getLastSeen(myRoleId);

        const [recvRes, sentRes] = await Promise.all([
          fetch(`${API}/roles/${encodeURIComponent(myRoleId)}/messages/received?limit=200`, {
            headers: { Accept: "application/json" },
          }),
          fetch(`${API}/roles/${encodeURIComponent(myRoleId)}/messages/sent?limit=200`, {
            headers: { Accept: "application/json" },
          }),
        ]);
        if (!recvRes.ok) throw new Error(`HTTP ${recvRes.status} (received)`);
        if (!sentRes.ok) throw new Error(`HTTP ${sentRes.status} (sent)`);

        const recvJson = await recvRes.json();
        const sentJson = await sentRes.json();

        const recv: AnyMsg[] = asArray(recvJson).map((m: any) => normalizeReceived(m, myRoleId));
        const sent: AnyMsg[] = asArray(sentJson).map((m: any) => normalizeSent(m, myRoleId));

        // 我已回复的请求集合（sent 中的 response 带 inReplyTo）
        const responded = new Set<string>(
          sent
            .filter((m) => (m.kind ?? "request") === "response" && !!m.inReplyTo)
            .map((m) => m.inReplyTo!) // 已过滤，非空断言安全
        );

        // 仅保留：请求 + 未被我回复 + 比 lastSeen 新
        const backlog: AnyMsg[] = recv
          .filter(
            (m) =>
              (m.kind ?? "request") === "request" &&
              !responded.has(m.id) &&
              newerThan(m.createdAt, last)
          )
          .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

        if (backlog.length > 0) {
          // 转成 PushMessage 再入队（需要 dir 字段）
          const pushes: PushMessage[] = backlog.map((m) => toPushMessage(m, myRoleId));
          setQueue((q) => dedupeById<PushMessage>([...q, ...pushes]));
          bumpLastSeen(myRoleId, backlog[backlog.length - 1].createdAt);
        }
      } catch {
        // 静默失败：最多只是登录后不弹历史
      }
    })();
  }, [myRoleId]);

  /* ---------------- 快捷回复 ---------------- */
  async function reply(text: string, inReplyTo: string, toRoleId: string, createdAt?: string) {
    if (!myRoleId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fromRoleId: myRoleId,
          toRoleId,
          text: text.trim(),
          kind: "response",
          inReplyTo,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const reason = j?.error ? ` - ${j.error}` : "";
        throw new Error(`HTTP ${res.status}${reason}`);
      }
      setQueue((q) => q.slice(1));
      bumpLastSeen(myRoleId, createdAt ?? new Date().toISOString());
    } catch (e: any) {
      addToast({ text: e?.message ?? "Failed to send reply.", fromRoleId: myRoleId });
    } finally {
      setSending(false);
    }
  }

  const cur = queue[0] ?? null;

  return (
    <>
      <IncomingModal
        open={!!cur}
        item={
          cur && {
            id: cur.id,
            text: cur.text,
            createdAt: cur.createdAt,
            from: { id: cur.fromRoleId, name: "" },
          }
        }
        tableLabel={"Request"}
        onSorry={() => cur && reply(REPLY_SORRY, cur.id, cur.fromRoleId, cur.createdAt)}
        onSure={() => cur && reply(REPLY_SURE, cur.id, cur.fromRoleId, cur.createdAt)}
        onIgnore={() => {
          if (cur) bumpLastSeen(myRoleId, cur.createdAt);
          setQueue((q) => q.slice(1));
        }}
      />
      <ToastRenderer />
    </>
  );
}

/* ---------------- helpers ---------------- */

// 将宽松的 AnyMsg 转换为 PushMessage（补齐 dir）
function toPushMessage(m: AnyMsg, me: string): PushMessage {
  return {
    id: m.id,
    fromRoleId: m.fromRoleId,
    toRoleId: m.toRoleId,
    text: m.text,
    createdAt: m.createdAt,
    kind: (m.kind ?? "request") as "request" | "response",
    inReplyTo: m.inReplyTo,
    dir: m.fromRoleId === me ? "out" : "in",
  };
}

// 服务器可能返回数组，或 {items:[]} / {data:[]}
function asArray<T = any>(j: any): T[] {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.items)) return j.items;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
}

// /received -> { id, from:{id,name}, text, createdAt, kind?, inReplyTo? }
function normalizeReceived(raw: any, me: string): AnyMsg {
  return {
    id: String(raw.id),
    fromRoleId: String(raw.from?.id ?? raw.fromRoleId ?? raw.from ?? ""),
    toRoleId: me,
    text: String(raw.text ?? ""),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    kind: raw.kind === "response" ? "response" : "request",
    inReplyTo: typeof raw.inReplyTo === "string" ? raw.inReplyTo : undefined,
  };
}

// /sent -> { id, to:{id,name}, text, createdAt, kind?, inReplyTo? }
function normalizeSent(raw: any, me: string): AnyMsg {
  return {
    id: String(raw.id),
    fromRoleId: me,
    toRoleId: String(raw.to?.id ?? raw.toRoleId ?? raw.to ?? ""),
    text: String(raw.text ?? ""),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    kind: raw.kind === "response" ? "response" : "request",
    inReplyTo: typeof raw.inReplyTo === "string" ? raw.inReplyTo : undefined,
  };
}

function toMs(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
function newerThan(createdAt: string, lastSeenISO: string | 0): boolean {
  if (!lastSeenISO) return true;
  return toMs(createdAt) > toMs(String(lastSeenISO));
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

// 以 roleId 为维度记录“最后看过”的时间戳（ISO）
function lastSeenKey(roleId: string) {
  return `inbox:lastSeen:${roleId}`;
}
function getLastSeen(roleId: string): string | 0 {
  try {
    const v = localStorage.getItem(lastSeenKey(roleId));
    return v || 0;
  } catch {
    return 0;
  }
}
function bumpLastSeen(roleId: string, iso: string) {
  try {
    const cur = getLastSeen(roleId);
    if (!cur || toMs(iso) > toMs(String(cur))) {
      localStorage.setItem(lastSeenKey(roleId), iso);
    }
  } catch {
    // ignore
  }
}

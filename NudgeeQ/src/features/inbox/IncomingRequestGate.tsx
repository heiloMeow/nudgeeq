// src/features/inbox/IncomingRequestGate.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../app/store";
import { useEventStream, type PushMessage } from "./useEventStream";
import { IncomingModal } from "./IncomingModal";
import { useToasts } from "./Toasts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

const REPLY_SORRY = "Sorry, I can’t help right now.";
const REPLY_SURE  = "Sure.";

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
  fromRoleName?: string;
  fromTableId?: string;
  fromSeatId?: number;
};

type RoleMeta = {
  id: string;
  name: string;
  tableId?: string;
  seatId?: number;
};

export default function IncomingRequestGate() {
  const { user } = useApp();
  const myRoleId = user?.id || "";

  const [queue, setQueue] = useState<PushMessage[]>([]);
  const [sending, setSending] = useState(false);
  const { addToast, renderer: ToastRenderer } = useToasts();
  const [roleMeta, setRoleMeta] = useState<Record<string, RoleMeta>>({});
  const roleMetaRef = useRef<Record<string, RoleMeta>>({});
  const roleFetchPendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    roleMetaRef.current = roleMeta;
  }, [roleMeta]);

  const ensureRoleMeta = useCallback(
    (roleId: string | undefined, hint?: Partial<RoleMeta>) => {
      const id = (roleId ?? "").trim();
      if (!id) return;

      const current = roleMetaRef.current[id];
      let merged = current;

      if (hint) {
        const candidate: RoleMeta = {
          id,
          name: toRoleName(hint.name, current?.name, id),
          tableId: toTableId(hint.tableId ?? current?.tableId),
          seatId: toSeatId(hint.seatId ?? current?.seatId),
        };
        if (
          !current ||
          current.name !== candidate.name ||
          current.tableId !== candidate.tableId ||
          current.seatId !== candidate.seatId
        ) {
          merged = candidate;
          setRoleMeta((prev) => ({ ...prev, [id]: candidate }));
        }
      }

      const latest = merged ?? roleMetaRef.current[id];
      const needsName = !latest?.name || latest.name === id;
      const needsTable = !latest?.tableId;
      if ((!needsName && !needsTable) || roleFetchPendingRef.current.has(id)) {
        return;
      }

      roleFetchPendingRef.current.add(id);
      (async () => {
        try {
          const res = await fetch(`${API}/roles/${encodeURIComponent(id)}`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          const info: RoleMeta = {
            id,
            name: toRoleName(data.name, latest?.name, id),
            tableId: toTableId(
              data.tableId ?? data.table?.id ?? data.tableID ?? latest?.tableId
            ),
            seatId: toSeatId(data.seatId ?? data.seat?.id ?? latest?.seatId),
          };
          setRoleMeta((prev) => ({ ...prev, [id]: info }));
        } catch {
          // keep at least a readable fallback
          setRoleMeta((prev) => {
            if (prev[id]) return prev;
            return {
              ...prev,
              [id]: {
                id,
                name: toRoleName(hint?.name, undefined, id),
                tableId: toTableId(hint?.tableId),
                seatId: toSeatId(hint?.seatId),
              },
            };
          });
        } finally {
          roleFetchPendingRef.current.delete(id);
        }
      })();
    },
    [setRoleMeta]
  );

  /* ---------------- 实时推送 ---------------- */
  const onPush = useCallback(
    (m: PushMessage) => {
      if (!myRoleId || m.toRoleId !== myRoleId) return;

      if ((m.kind ?? "request") === "request") {
        ensureRoleMeta(m.fromRoleId, {
          name: m.fromRoleName,
          tableId: toTableId(m.fromTableId),
          seatId: toSeatId(m.fromSeatId),
        });
        setQueue((q) => (q.some((x) => x.id === m.id) ? q : [...q, m]));
        bumpLastSeen(myRoleId, m.createdAt);
      } else {
        addToast({ text: m.text, fromRoleId: m.fromRoleId });
      }
    },
    [myRoleId, addToast, ensureRoleMeta]
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
          const pushes: PushMessage[] = backlog.map((m) => {
            ensureRoleMeta(m.fromRoleId, {
              name: m.fromRoleName,
              tableId: toTableId(m.fromTableId),
              seatId: toSeatId(m.fromSeatId),
            });
            return toPushMessage(m, myRoleId);
          });
          setQueue((q) => dedupeById<PushMessage>([...q, ...pushes]));
          bumpLastSeen(myRoleId, backlog[backlog.length - 1].createdAt);
        }
      } catch {
        // 静默失败：最多只是登录后不弹历史
      }
    })();
  }, [myRoleId, ensureRoleMeta]);

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
  const senderMeta = cur ? roleMeta[cur.fromRoleId] : undefined;
  const senderName =
    (senderMeta?.name && senderMeta.name.trim()) ||
    (typeof cur?.fromRoleName === "string" && cur.fromRoleName.trim()
      ? cur.fromRoleName.trim()
      : undefined) ||
    (cur?.fromRoleId ?? "");
  const locationLabel = senderMeta?.tableId
    ? `Table ${senderMeta.tableId}${
        senderMeta.seatId && Number.isFinite(senderMeta.seatId) ? ` · Seat ${senderMeta.seatId}` : ""
      }`
    : undefined;
  const fallbackTableId = cur ? toTableId(cur.fromTableId) : undefined;
  const fallbackSeatId = cur ? toSeatId(cur.fromSeatId) : undefined;

  return (
    <>
      <IncomingModal
        open={!!cur}
        item={
          cur && {
            id: cur.id,
            text: cur.text,
            createdAt: cur.createdAt,
            from: {
              id: cur.fromRoleId,
              name: senderName,
              tableId: senderMeta?.tableId ?? fallbackTableId,
              seatId: senderMeta?.seatId ?? fallbackSeatId,
            },
          }
        }
        tableLabel={locationLabel ?? "New Request"}
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
    fromRoleName: m.fromRoleName,
    fromTableId: m.fromTableId,
    fromSeatId: m.fromSeatId,
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
    fromRoleName:
      typeof raw.from?.name === "string" && raw.from.name.trim()
        ? raw.from.name
        : typeof raw.fromName === "string" && raw.fromName.trim()
        ? raw.fromName
        : undefined,
    fromTableId: toTableId(
      raw.from?.tableId ??
        raw.tableId ??
        raw.from?.table?.id ??
        raw.from?.tableID ??
        raw.table?.id
    ),
    fromSeatId: toSeatId(raw.from?.seatId ?? raw.seatId ?? raw.from?.seat?.id ?? raw.seat?.id),
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

function toRoleName(hint: unknown, existing: string | undefined, fallback: string): string {
  if (typeof hint === "string") {
    const trimmed = hint.trim();
    if (trimmed) return trimmed;
  }
  if (typeof existing === "string") {
    const trimmed = existing.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

function toTableId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function toSeatId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
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

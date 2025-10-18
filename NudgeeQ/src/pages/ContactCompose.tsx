// src/pages/ContactCompose.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { useEventStream, type PushMessage } from "../features/inbox/useEventStream";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

type Peer = {
  id: string;
  name: string;
  avatar: string;
  tableId?: string;
  seatId?: number;
  signals: string[];
};

type MsgKind = "request" | "response";

type Msg = {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  text: string;
  createdAt: string;
  kind: MsgKind;
  inReplyTo?: string;
};

type NavState = { tableId?: string | number; peerId?: string; peerName?: string };

export default function ContactCompose() {
  const nav = useNavigate();
  const { user } = useApp();
  const location = useLocation();
  const { state } = (location as { state?: NavState }) ?? {};

  const myId = user?.id ?? "";

  // --- peerId: 路由 state -> ?peerId= -> localStorage(lastPeerId) ---
  const peerIdFromQuery = useMemo(() => {
    try {
      const search = new URLSearchParams(location.search);
      return search.get("peerId") || undefined;
    } catch {
      return undefined;
    }
  }, [location.search]);

  const peerId =
    state?.peerId ??
    peerIdFromQuery ??
    (typeof localStorage !== "undefined" ? localStorage.getItem("lastPeerId") ?? "" : "");

  const tableId = state?.tableId ? String(state.tableId) : "";

  const [peer, setPeer] = useState<Peer | null>(null);
  const [loadingPeer, setLoadingPeer] = useState(true);
  const [errPeer, setErrPeer] = useState("");

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [errMsgs, setErrMsgs] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  /* ---------- load peer info ---------- */
  useEffect(() => {
    if (!peerId) {
      setLoadingPeer(false);
      setErrPeer("No peer specified.");
      return;
    }
    let stop = false;
    (async () => {
      try {
        setLoadingPeer(true);
        setErrPeer("");
        const res = await fetch(`${API}/roles/${encodeURIComponent(peerId)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!stop) {
          const info: Peer = {
            id: String(data.id),
            name: String(data.name ?? state?.peerName ?? "Contact"),
            avatar: ensureAvatar(String(data.avatar ?? "")),
            tableId: data.tableId ? String(data.tableId) : undefined,
            seatId:
              typeof data.seatId === "number" ? data.seatId : Number(data.seatId ?? 0) || undefined,
            signals: Array.isArray(data.signals) ? data.signals : [],
          };
          setPeer(info);
          try {
            localStorage.setItem("lastPeerId", info.id);
          } catch {}
        }
      } catch (e: any) {
        if (!stop) setErrPeer(e?.message ?? "Failed to load");
      } finally {
        if (!stop) setLoadingPeer(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [peerId, state?.peerName]);

  /* ---------- load messages (both directions) ---------- */
  const loadMessages = useCallback(async () => {
    setErrMsgs("");

    // 若 myId/peerId 不齐，直接结束 loading，避免“无限 Loading…”
    if (!myId || !peerId) {
      setMsgs([]);
      setLoadingMsgs(false);
      return;
    }

    setLoadingMsgs(true);
    try {
      const [sentRes, recvRes] = await Promise.all([
        fetch(`${API}/roles/${encodeURIComponent(myId)}/messages/sent?limit=200`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`${API}/roles/${encodeURIComponent(myId)}/messages/received?limit=200`, {
          headers: { Accept: "application/json" },
        }),
      ]);
      if (!sentRes.ok) throw new Error(`HTTP ${sentRes.status} (sent)`);
      if (!recvRes.ok) throw new Error(`HTTP ${recvRes.status} (received)`);

      const sentJson = await sentRes.json();
      const recvJson = await recvRes.json();

      // 兼容 {items:[...]} / {data:[...]} / 直接数组
      const sentRaw = asArray<any>(sentJson);
      const recvRaw = asArray<any>(recvJson);

      // 兼容 “嵌套 from/to 对象” 的返回
      const normalizeSent = (m: any): Msg => ({
        id: String(m.id),
        fromRoleId: myId,
        toRoleId: String(m.to?.id ?? m.toRoleId ?? m.to ?? ""),
        text: String(m.text ?? ""),
        createdAt: String(m.createdAt ?? new Date().toISOString()),
        kind: m?.kind === "response" ? "response" : ("request" as const),
        inReplyTo: typeof m.inReplyTo === "string" ? m.inReplyTo : undefined,
      });

      const normalizeRecv = (m: any): Msg => ({
        id: String(m.id),
        fromRoleId: String(m.from?.id ?? m.fromRoleId ?? m.from ?? ""),
        toRoleId: myId,
        text: String(m.text ?? ""),
        createdAt: String(m.createdAt ?? new Date().toISOString()),
        kind: m?.kind === "response" ? "response" : ("request" as const),
        inReplyTo: typeof m.inReplyTo === "string" ? m.inReplyTo : undefined,
      });

      const sent: Msg[] = sentRaw.map(normalizeSent);
      const recv: Msg[] = recvRaw.map(normalizeRecv);

      const all = [...sent, ...recv].filter(
        (m) =>
          (m.fromRoleId === myId && m.toRoleId === peerId) ||
          (m.fromRoleId === peerId && m.toRoleId === myId)
      );

      all.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id.localeCompare(b.id)
      );

      setMsgs(dedupeById(all));
    } catch (e: any) {
      setErrMsgs(e?.message ?? "Failed to load messages");
    } finally {
      setLoadingMsgs(false);
    }
  }, [myId, peerId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  /* ---------- SSE live updates ---------- */
  const onPush = useCallback(
    (m: PushMessage) => {
      const belongs =
        (m.fromRoleId === myId && m.toRoleId === peerId) ||
        (m.fromRoleId === peerId && m.toRoleId === myId);
      if (!belongs) return;

      setMsgs((prev) => {
        const next = [...prev];

        if (m.kind === "response" && m.inReplyTo) {
          if (!next.some((x) => x.id === m.id)) {
            next.push({
              id: m.id,
              fromRoleId: m.fromRoleId,
              toRoleId: m.toRoleId,
              text: m.text,
              createdAt: m.createdAt ?? new Date().toISOString(),
              kind: "response" as const,
              inReplyTo: m.inReplyTo,
            });
          }
        } else {
          if (!next.some((x) => x.id === m.id)) {
            next.push({
              id: m.id,
              fromRoleId: m.fromRoleId,
              toRoleId: m.toRoleId,
              text: m.text,
              createdAt: m.createdAt ?? new Date().toISOString(),
              kind: "request" as const,
            });
          }
        }

        next.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            a.id.localeCompare(b.id)
        );
        return dedupeById(next);
      });
    },
    [myId, peerId]
  );

  useEventStream(myId, onPush);

  /* ---------- derived ---------- */
  const responsesByReqId = useMemo(() => {
    const map = new Map<string, Msg>();
    for (const m of msgs) {
      if (m.kind === "response" && m.inReplyTo) {
        const prev = map.get(m.inReplyTo);
        if (!prev || new Date(m.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
          map.set(m.inReplyTo, m);
        }
      }
    }
    return map;
  }, [msgs]);

  const requests = useMemo(() => msgs.filter((m) => m.kind === "request"), [msgs]);

  /* ---------- send a new request ---------- */
  async function send() {
    if (!myId || !peerId || !input.trim() || sending) return;
    const text = input.trim();
    setSending(true);
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fromRoleId: myId,
          toRoleId: peerId,
          text,
          kind: "request",
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const reason = j?.error ? ` - ${j.error}` : "";
        throw new Error(`HTTP ${res.status}${reason}`);
      }

      const idJson = await res.json().catch(() => ({}));
      const newId = idJson?.id ?? `${Date.now()}`;

      setMsgs((prev) =>
        dedupeById(
          [
            ...prev,
            {
              id: String(newId),
              fromRoleId: myId,
              toRoleId: peerId,
              text,
              createdAt: new Date().toISOString(),
              kind: "request" as const,
            },
          ].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
              a.id.localeCompare(b.id)
          )
        )
      );
      setInput("");
    } catch (e: any) {
      alert(e?.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* Header */}
      <header className="px-7 py-6 flex items-center justify-between">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
        <h1 className="font-display text-[clamp(22px,4.6vw,36px)]">
          {tableId ? `Table ${tableId}` : "Contact"}
        </h1>
        <button
          onClick={() => nav(-1)}
          className="rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/15"
          aria-label="Back"
        >
          ←
        </button>
      </header>

      <section className="grow grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 pb-10">
        {/* Left: peer info */}
        <div
          className="
            rounded-[24px] p-6 border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)]
          "
        >
          {loadingPeer ? (
            <div className="opacity-85">Loading…</div>
          ) : errPeer ? (
            <div className="text-red-200">Error: {errPeer}</div>
          ) : peer ? (
            <div className="grid gap-4">
              <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                <div
                  className="
                    size-[120px] md:size-[140px] rounded-full grid place-items-center
                    border border-white/30 bg-white/15 shadow-[0_12px_32px_rgba(0,0,0,.35)]
                    overflow-hidden
                  "
                >
                  <img src={peer.avatar} alt={peer.name} className="w-[86%] h-[86%] object-contain" />
                </div>
                <div>
                  <div className="text-xl font-semibold">{peer.name}</div>
                  <div className="opacity-85 mt-1">
                    {peer.tableId ? `Table ${peer.tableId}` : "—"}
                    {peer.seatId ? ` · Seat ${peer.seatId}` : ""}
                  </div>
                </div>
              </div>
              {peer.signals.length > 0 && (
                <div className="mt-2 space-y-2">
                  {peer.signals.map((t, i) => (
                    <div
                      key={i}
                      className="
                        inline-block max-w-full rounded-2xl px-4 py-2 mr-2
                        border border-white/30 bg-white/10 backdrop-blur
                        shadow-[0_8px_20px_rgba(0,0,0,.35)]
                      "
                    >
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="opacity-85">No user.</div>
          )}
        </div>

        {/* Right: chat thread + composer */}
        <div
          className="
            rounded-[24px] p-0 border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)]
            grid grid-rows-[1fr_auto]
          "
        >
          <ChatThread
            myId={myId}
            requests={msgs.filter((m) => m.kind === "request")}
            responsesByReqId={buildResponseMap(msgs)}
            loading={loadingMsgs}
            error={errMsgs || (!myId || !peerId ? "Sign in and select a contact to view." : "")}
          />

          <div className="p-4 border-t border-white/15">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your request…"
                rows={3}
                className="flex-1 rounded-xl px-3 py-2 bg-black/25 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
              <button
                onClick={send}
                disabled={!input.trim() || !myId || !peerId || sending}
                className="h-[44px] rounded-xl px-5 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------------- components ---------------- */

function ChatThread({
  myId,
  requests,
  responsesByReqId,
  loading,
  error,
}: {
  myId: string;
  requests: Msg[];
  responsesByReqId: Map<string, Msg>;
  loading: boolean;
  error: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight + 1000;
  }, [requests, responsesByReqId]);

  if (loading) return <div className="p-4 opacity-85">Loading conversation…</div>;
  if (error) return <div className="p-4 text-red-200">{error}</div>;

  return (
    <div ref={scrollerRef} className="overflow-y-auto p-4 space-y-4 max-h-[55vh]">
      {requests.length === 0 && <div className="opacity-80">No messages yet.</div>}
      {requests.map((m) => {
        const mine = m.fromRoleId === myId;
        const reply = responsesByReqId.get(m.id);
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%]`}>
              <div
                className={[
                  "px-3 py-2 rounded-2xl shadow",
                  mine
                    ? "bg-[rgba(255,255,255,.22)] border border-white/30"
                    : "bg-[rgba(0,0,0,.28)] border border-white/20",
                ].join(" ")}
                title={new Date(m.createdAt).toLocaleString()}
              >
                <div className="whitespace-pre-wrap leading-snug">{m.text}</div>
              </div>
              <div className="mt-1 text-xs">
                {reply ? (
                  <span className="inline-block rounded-full px-2 py-[2px] border border-emerald-300/50 bg-emerald-300/10 text-emerald-200">
                    Reply: {reply.text}
                  </span>
                ) : (
                  <span className="inline-block rounded-full px-2 py-[2px] border border-white/30 bg-white/10 text-white/80">
                    Pending…
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function ensureAvatar(s: string): string {
  if (!s) return "/avatars/white-smile.png";
  return s.startsWith("/") || s.startsWith("http") ? s : `/avatars/${s}`;
}

function dedupeById(list: Msg[]): Msg[] {
  const seen = new Set<string>();
  const out: Msg[] = [];
  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

// unwrap server responses that may be array or {items:[]} / {data:[]}
function asArray<T = any>(j: any): T[] {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.items)) return j.items;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
}

function buildResponseMap(all: Msg[]): Map<string, Msg> {
  const map = new Map<string, Msg>();
  for (const m of all) {
    if (m.kind === "response" && m.inReplyTo) {
      const prev = map.get(m.inReplyTo);
      if (!prev || new Date(m.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
        map.set(m.inReplyTo, m);
      }
    }
  }
  return map;
}

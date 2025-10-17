// src/pages/ContactCompose.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

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

export default function ContactCompose() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { peerId?: string } };
  const peerId = state?.peerId ?? "";
  const { user } = useApp();

  const [peer, setPeer] = useState<Peer | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");

  const canSend = Boolean(user?.id && peer?.id && text.trim());

  useEffect(() => {
    if (!peerId) {
      nav(-1);
      return;
    }
    let stop = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(`${API}/roles/${encodeURIComponent(peerId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!stop) {
          setPeer({
            id: String(data.id),
            name: String(data.name ?? "Unknown"),
            avatar: ensureAvatar(String(data.avatar ?? "")),
            tableId: data.tableId ? String(data.tableId) : undefined,
            seatId: typeof data.seatId === "number" ? data.seatId : Number(data.seatId ?? 0) || undefined,
            signals: Array.isArray(data.signals) ? data.signals : [],
          });
        }
      } catch (e: any) {
        if (!stop) setErr(e?.message ?? "Failed to load");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [peerId, nav]);

  async function send() {
    if (!canSend) return;
    try {
      setErr("");
      const payload = {
        fromRoleId: String(user!.id), // REQUIRED by backend
        toRoleId: String(peer!.id),   // REQUIRED by backend
        text: text.trim(),            // REQUIRED by backend
      };

      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const reason = j?.error ? ` - ${j.error}` : "";
        throw new Error(`HTTP ${res.status}${reason}`);
      }

      setText("");
      alert("Message sent.");
      nav(-1);
    } catch (e: any) {
      setErr(e?.message ?? "Send failed");
    }
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* Background texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      {/* Header */}
      <header className="px-7 py-6 flex items-center justify-between">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
        <h1 className="font-display text-[clamp(22px,4.6vw,36px)]">
          {peer?.tableId ? `Table ${peer.tableId}` : "Contact"}
        </h1>
        <button
          onClick={() => nav(-1)}
          className="rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/15"
          aria-label="Back"
        >
          ←
        </button>
      </header>

      {/* Content */}
      <section className="grow grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 pb-10">
        {/* Left: recipient info */}
        <div
          className="
            rounded-[24px] p-6 border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)]
          "
        >
          {loading ? (
            <div className="opacity-85">Loading…</div>
          ) : err ? (
            <div className="text-red-200">Error: {err}</div>
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

              {/* Signals preview */}
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

        {/* Right: compose and send */}
        <div
          className="
            rounded-[24px] p-6 border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)]
            grid content-start gap-4
          "
        >
          <h2 className="font-display text-2xl">Compose Message</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message…"
            rows={8}
            className="
              w-full rounded-xl px-3 py-2 bg-black/25 border border-white/25
              focus:outline-none focus:ring-2 focus:ring-white/40
            "
          />
          <div className="flex items-center gap-3">
            <button
              onClick={send}
              disabled={!canSend}
              className="
                rounded-xl px-5 py-2.5 bg-brand-500 hover:bg-brand-700
                disabled:opacity-50
              "
            >
              Send
            </button>
            {!user?.id && <span className="text-sm text-white/70">You are not logged in.</span>}
          </div>
          {err && <div className="text-red-200 text-sm">{err}</div>}
        </div>
      </section>
    </main>
  );
}

function ensureAvatar(s: string): string {
  if (!s) return "/avatars/white-smile.png";
  return s.startsWith("/") || s.startsWith("http") ? s : `/avatars/${s}`;
}

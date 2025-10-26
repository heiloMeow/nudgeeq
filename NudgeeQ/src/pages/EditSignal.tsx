// src/pages/EditSignal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { fetchMyRoleDetail, ensureAvatar } from "./userFlowApi";
import type { UserEditState } from "./userFlowTypes";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

type SignalSide = "left" | "right";
type SignalItem = { id: string; text: string; x: number; y: number; side: SignalSide };

export default function EditSignal() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: UserEditState };
  const { user } = useApp();

  const [base, setBase] = useState<UserEditState>({
    tableId: state?.tableId,
    seatId: state?.seatId,
    name: state?.name,
    avatarSrc: state?.avatarSrc,
    signals: state?.signals,
  });
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    setBase((prev) => ({
      tableId: state.tableId ?? prev.tableId,
      seatId: state.seatId ?? prev.seatId,
      name: state.name ?? prev.name,
      avatarSrc: state.avatarSrc ?? prev.avatarSrc,
      signals: state.signals ?? prev.signals ?? [],
    }));
    if (state.signals && state.signals.length > 0 && signals.length === 0) {
      seedSignals(state.signals);
    }
  }, [state, signals.length]);

  useEffect(() => {
    if (!user?.id) {
      nav("/", { replace: true });
      return;
    }
    if (state?.signals && state.signals.length > 0) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const info = await fetchMyRoleDetail(user.id);
        if (!active) return;
        setBase((prev) => ({
          tableId: prev.tableId ?? (info.tableId ? String(info.tableId) : undefined),
          seatId: prev.seatId ?? (info.seatId ? String(info.seatId) : undefined),
          name: prev.name ?? info.name,
          avatarSrc: prev.avatarSrc ?? ensureAvatar(info.avatar),
          signals: prev.signals ?? info.signals ?? [],
        }));
        if (signals.length === 0 && info.signals.length > 0) {
          seedSignals(info.signals);
        }
      } catch (e: unknown) {
        if (!active) return;
        const message = e instanceof Error ? e.message : "Failed to load your signals.";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, nav, state, signals.length]);

  function seedSignals(list: string[]) {
    const rect = stageRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 480;
    const cy = rect ? rect.height / 2 : 260;
    setSignals((existing) => {
      if (existing.length > 0) return existing;
      return list.map((text, index) => {
        const side: SignalSide = index % 2 === 0 ? "left" : "right";
        const x = side === "left" ? cx - 220 : cx + 220;
        const y = cy + ((index % 3) - 1) * 60;
        return { id: crypto.randomUUID(), text, x, y, side };
      });
    });
  }

  function addSignal(text: string, from: "left" | "center" | "right" = "center") {
    if (!text.trim()) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const id = crypto.randomUUID();
    const cx = rect ? rect.width / 2 : 480;
    const cy = rect ? rect.height / 2 : 260;
    const side: SignalSide =
      from === "left" ? "left" : from === "right" ? "right" : signals.length % 2 ? "right" : "left";
    const x = side === "left" ? cx - 260 : cx + 260;
    const y = cy + (Math.random() * 120 - 60);
    setSignals((s) => [...s, { id, text: text.trim(), x, y, side }]);
  }

  function bindDrag(sig: SignalItem) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startY = e.clientY;
        const start = { x: sig.x, y: sig.y };
        const rect = stageRef.current!.getBoundingClientRect();
        const onMove = (ev: PointerEvent) => {
          const nx = start.x + (ev.clientX - startX);
          const ny = start.y + (ev.clientY - startY);
          const pad = 20;
          const w = rect.width;
          const h = rect.height;
          sig.x = Math.max(pad, Math.min(w - pad, nx));
          sig.y = Math.max(pad, Math.min(h - pad, ny));
          setSignals((s) => [...s]);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerup", onUp, { once: true });
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 10 : 4;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          if (e.key === "ArrowLeft") sig.x -= step;
          if (e.key === "ArrowRight") sig.x += step;
          if (e.key === "ArrowUp") sig.y -= step;
          if (e.key === "ArrowDown") sig.y += step;
          setSignals((s) => [...s]);
        }
      },
    };
  }

  function removeSignal(id: string) {
    setSignals((s) => s.filter((x) => x.id !== id));
  }

  function addCustom() {
    if (!draftText.trim()) return;
    addSignal(draftText.trim(), "center");
    setDraftText("");
    setAdding(false);
  }

  const presets = useMemo(
    () => ({
      left: [
        "I have pen",
        "I have Type-C cable",
        "I have Lightning cable",
        "You can borrow my calculator",
        "I have MacBook charger",
      ],
      center: ["Feel free to sit here", "I am waiting for my friend", "Prefer to sit alone"],
      right: ["Looking for study buddy", "Low energy, please be gentle", "Here if you need anytime"],
    }),
    []
  );

  const saveSignals = async () => {
    if (!user?.id) {
      nav("/", { replace: true });
      return;
    }
    const tableId = base.tableId;
    const seatId = base.seatId;
    const name = base.name;
    const avatarSrc = base.avatarSrc;
    if (!tableId || !seatId || !name || !avatarSrc) {
      setError("Missing profile information. Please try again.");
      return;
    }

    const textSignals = signals.map((s) => s.text.trim()).filter(Boolean);

    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        avatar: avatarSrc,
        tableId,
        seatId: Number(seatId),
        signals: textSignals,
      };

      const res = await fetch(`${API}/roles/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      nav("/nearby", { replace: true, state: { tableId } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save signals.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = base.avatarSrc ?? "/avatars/white-smile.png";

  return (
    <main
      className="
        relative min-h-svh overflow-hidden flex flex-col text-white
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />
      <div className="relative z-10 px-7 py-6 flex items-center justify-between">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
        <button
          onClick={() => nav(-1)}
          className="rounded-full border border-white/30 bg-white/10 backdrop-blur px-4 py-2 text-sm hover:bg-white/15"
          aria-label="Back"
        >
          {"<"} Back
        </button>
      </div>

      <section className="px-6 flex flex-col items-center text-center relative z-10">
        <h2 className="font-display text-[clamp(28px,5vw,48px)] mt-4">Update signals</h2>
        <p className="text-white/80 mt-2 max-w-2xl">
          Drag notes around your avatar or add new ones so nearby students know how you can help.
        </p>
      </section>

      <section className="relative z-10 mt-8 px-6">
        <div
          ref={stageRef}
          className="relative mx-auto w-full max-w-5xl h-[520px] md:h-[560px] rounded-2xl"
          role="region"
          aria-label="Signal editor"
        >
          {signals.map((sig) => (
            <SignalBubble
              key={sig.id}
              text={sig.text}
              style={{
                left: sig.x,
                top: sig.y,
                position: "absolute",
                transform: "translate(-50%, -50%)",
              }}
              onRemove={() => removeSignal(sig.id)}
              {...bindDrag(sig)}
            />
          ))}

          <div
            className="
              absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
              pointer-events-none flex flex-col items-center
            "
          >
            <div
              className="
                pointer-events-auto
                rounded-full grid place-items-center
                size-[220px] md:size-[280px]
                bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]
                shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]
                backdrop-blur-md
              "
            >
              <SafeImg src={currentAvatar} alt={base.name ?? "Avatar"} />
            </div>

            <div className="mt-4 grid place-items-center pointer-events-auto">
              {!adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="rounded-lg px-4 py-2 border border-white/25 bg-white/10 hover:bg-white/15 backdrop-blur"
                >
                  Add Signal
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustom()}
                    placeholder="Type your signal"
                    className="rounded-md px-3 py-2 bg-black/25 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                  <button onClick={addCustom} className="rounded-md px-3 py-2 bg-brand-500 hover:bg-brand-700">
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setDraftText("");
                      setAdding(false);
                    }}
                    className="rounded-md px-3 py-2 border border-white/25 bg-white/10 hover:bg-white/15"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PresetColumn title="Share items" colorDot="bg-pink-300" items={presets.left} onPick={(t) => addSignal(t, "left")} />
          <PresetColumn title="General" colorDot="bg-violet-300" items={presets.center} onPick={(t) => addSignal(t, "center")} />
          <PresetColumn title="Ask for help" colorDot="bg-rose-300" items={presets.right} onPick={(t) => addSignal(t, "right")} />
        </div>
      </section>

      <section className="px-6 py-10 relative z-10 grid place-items-center">
        <button
          onClick={saveSignals}
          disabled={saving || loading}
          className="
            relative min-w-[220px] px-6 py-3 rounded-2xl
            border border-white/30
            bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]
            backdrop-blur-xl text-white text-lg font-semibold tracking-wide
            shadow-[0_12px_36px_rgba(0,0,0,.35)]
            before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]
            hover:bg-white/20 active:scale-[.99] transition
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {saving ? "Saving..." : "Save signals"}
        </button>
        {error && <div className="mt-3 text-red-200 text-sm text-center">{error}</div>}
      </section>
    </main>
  );
}

function SignalBubble({
  text,
  style,
  onRemove,
  onPointerDown,
  onKeyDown,
}: {
  text: string;
  style: React.CSSProperties;
  onRemove: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`Signal: ${text}`}
      style={style}
      className={[
        "absolute z-20 touch-none select-none cursor-grab active:cursor-grabbing focus:outline-none",
        "relative max-w-[300px] rounded-2xl px-4 py-3",
        "bg-[linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.10))]",
        "border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]",
        "backdrop-blur-xl text-white/95 shadow-[0_10px_28px_rgba(0,0,0,.35)] hover:shadow-[0_14px_34px_rgba(0,0,0,.45)]",
        "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]",
      ].join(" ")}
    >
      <div className="pr-7 leading-snug tracking-wide">{text}</div>
      <button
        onClick={onRemove}
        className={[
          "absolute -top-2 -right-2 size-6 rounded-full",
          "grid place-items-center text-[13px] leading-none",
          "border border-white/40 bg-white/25 backdrop-blur hover:bg-white/35",
          "shadow-[0_4px_10px_rgba(0,0,0,.35)]",
        ].join(" ")}
        aria-label="Remove signal"
      >
        x
      </button>
    </div>
  );
}

function PresetColumn({
  title,
  colorDot,
  items,
  onPick,
}: {
  title: string;
  colorDot: string;
  items: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block size-3 rounded-full ${colorDot}`} />
        <div className="font-semibold opacity-90">{title}</div>
      </div>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t}>
            <button onClick={() => onPick(t)} className="text-left w-full hover:underline" aria-label={`Add: ${t}`}>
              {t}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SafeImg({ src, alt }: { src: string; alt?: string }) {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    setOk(true);
  }, [src]);
  if (!ok) {
    return <div className="w-[72%] h-[72%] rounded-full grid place-items-center text-xs opacity-80">no image</div>;
  }
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className="w-[72%] h-[72%] object-contain select-none pointer-events-none"
      onError={() => setOk(false)}
      draggable={false}
    />
  );
}

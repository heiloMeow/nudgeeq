// src/pages/UserSignalSelect.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { fetchMyRoleDetail } from "./userFlowApi";
import type { UserEditState } from "./userFlowTypes";

type SignalSide = "left" | "right";
type SignalItem = { id: string; text: string; x: number; y: number; side: SignalSide };

export default function UserSignalSelect() {
  const nav = useNavigate();
  const { user, draftUser } = useApp();
  const { state } = useLocation() as { state?: UserEditState };

  const [base, setBase] = useState<UserEditState>(state ?? {});
  const stateSignals = state?.signals;
  const baseSignals = base.signals;
  const stateTableId = state?.tableId;
  const stateSeatId = state?.seatId;
  const baseTableId = base.tableId;
  const baseSeatId = base.seatId;
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!user && !draftUser) {
      nav("/", { replace: true });
      return;
    }
    if (stateTableId && stateSeatId) return;
    if (!user?.id) return;

    let active = true;
    (async () => {
      try {
        const info = await fetchMyRoleDetail(user.id);
        if (!active) return;
        setBase((prev) => ({
          ...prev,
          tableId: prev.tableId ?? info.tableId,
          seatId: prev.seatId ?? info.seatId,
          name: prev.name ?? info.name,
          avatarSrc: prev.avatarSrc ?? info.avatar,
          signals: prev.signals ?? info.signals,
        }));
        const hasExistingSignals =
          (stateSignals?.length ?? 0) > 0 || signals.length > 0 || (baseSignals?.length ?? 0) > 0;
        if (!hasExistingSignals && info.signals.length > 0) {
          seedSignals(info.signals);
        }
      } catch {
        // ignore; subsequent steps will surface missing context
      }
    })();
    return () => {
      active = false;
    };
  }, [
    user,
    draftUser,
    nav,
    stateSignals,
    signals.length,
    baseSignals,
    stateTableId,
    stateSeatId,
    baseTableId,
    baseSeatId,
  ]);

  useEffect(() => {
    const list = stateSignals ?? baseSignals;
    if (list && list.length > 0 && signals.length === 0) {
      seedSignals(list);
    }
  }, [stateSignals, baseSignals, signals.length]);

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
    const rect = stageRef.current?.getBoundingClientRect();
    const id = crypto.randomUUID();
    const cx = rect ? rect.width / 2 : 480;
    const cy = rect ? rect.height / 2 : 260;
    const side: SignalSide =
      from === "left" ? "left" : from === "right" ? "right" : signals.length % 2 ? "right" : "left";
    const x = side === "left" ? cx - 260 : cx + 260;
    const y = cy + (Math.random() * 120 - 60);
    setSignals((s) => [...s, { id, text, x, y, side }]);
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

  const done = () => {
    if (!base.tableId || !base.seatId) {
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 1;
    const h = rect?.height ?? 1;

    const normalized = signals.map((s) => ({
      id: s.id,
      text: s.text,
      nx: +(s.x / w).toFixed(4),
      ny: +(s.y / h).toFixed(4),
    }));

    nav("/user/final", {
      state: {
        ...base,
        name: base.name,
        avatarSrc: base.avatarSrc,
        signals: normalized,
      },
    });
  };

  const currentAvatar = base.avatarSrc ?? "/avatars/white-smile.png";

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
        flex flex-col
      "
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      <header className="px-7 py-6 flex items-center justify-between gap-3 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>

        <div className="text-center grow">
          <div className="font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 2</div>
          <div className="font-display text-[clamp(20px,3.5vw,28px)]">Drag &amp; Show Your Signal</div>
        </div>

        <button
          onClick={done}
          aria-label="Continue"
          className="
            whitespace-nowrap rounded-lg px-4 py-2
            bg-brand-500 hover:bg-brand-700 transition
            shadow-[0_6px_18px_rgba(0,0,0,.35)] hover:shadow-[0_10px_26px_rgba(0,0,0,.5)]
            hover:ring-2 hover:ring-white/40
            focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none
          "
        >
          Continue
        </button>
      </header>

      <section className="grow grid place-items-center px-4">
        <div
          ref={stageRef}
          className="relative z-10 w-full max-w-4xl h-[380px] md:h-[420px] rounded-2xl overflow-visible"
          style={{ touchAction: "none" }}
          role="region"
          aria-label="Signal stage"
        >
          {signals.map((s) => (
            <SignalBubble
              key={s.id}
              text={s.text}
              style={{ left: s.x, top: s.y, transform: "translate(-50%, -50%)" }}
              onRemove={() => removeSignal(s.id)}
              {...bindDrag(s)}
            />
          ))}

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div
              className="
                pointer-events-auto
                rounded-full grid place-items-center
                size-[180px] md:size-[220px]
                bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]
                shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]
                backdrop-blur-md
              "
            >
              <SafeImg src={currentAvatar} alt="Selected avatar" />
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
                    placeholder="Type your signal…"
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

      <section className="px-6 pb-8 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        <PresetColumn title=" " colorDot="bg-pink-300" items={presets.left} onPick={(t) => addSignal(t, "left")} />
        <PresetColumn title=" " colorDot="bg-violet-300" items={presets.center} onPick={(t) => addSignal(t, "center")} />
        <PresetColumn title=" " colorDot="bg-rose-300" items={presets.right} onPick={(t) => addSignal(t, "right")} />
      </section>

      <button
        onClick={() => nav(-1)}
        className="
          fixed bottom-5 right-5 z-20 rounded-full border border-white/30
          bg-white/10 backdrop-blur px-4 py-2 text-sm hover:bg-white/15
        "
        aria-label="Back"
        title="Back"
      >
        ← Back
      </button>
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
        ×
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

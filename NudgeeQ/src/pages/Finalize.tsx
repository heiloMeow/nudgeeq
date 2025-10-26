// src/pages/Finalize.tsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

/** Normalized (percentage-based) signal used by the final stage. */
type NormalizedSignal = { id: string; text: string; nx: number; ny: number };
/** Backward-compat: accept pixel-based signal and convert to percentages. */
type PixelSignal = { id: string; text: string; x: number; y: number; side?: "left" | "right" };

export default function Finalize() {
  const nav = useNavigate();
  const { state } = useLocation() as {
    state?: {
      tableId?: string;
      seatId?: string;
      avatarSrc?: string;
      signals?: Array<NormalizedSignal | PixelSignal>;
    };
  };
  const { draftUser, user, commitUser } = useApp();

  const tableId = state?.tableId ?? "";
  const seatIdStr = state?.seatId ?? "";
  const seatIdNum = Number(seatIdStr || 0);
  const avatarSrc = state?.avatarSrc || "/avatars/white-smile.png"; // fallback avatar
  const rawSignals = state?.signals ?? [];

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  /** Stage size (for pixel→percentage conversion). */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    const update = () => {
      const r = stageRef.current?.getBoundingClientRect();
      if (r) setStageSize({ w: r.width, h: r.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /** Normalize signals: prefer nx/ny; otherwise convert x/y by stage size. */
  const signals = useMemo<NormalizedSignal[]>(() => {
    return rawSignals.map((s: any) => {
      if (typeof s.nx === "number" && typeof s.ny === "number") return s as NormalizedSignal;
      const nx = (s.x ?? 0) / (stageSize.w || 1);
      const ny = (s.y ?? 0) / (stageSize.h || 1);
      return { id: s.id, text: s.text, nx, ny };
    });
  }, [rawSignals, stageSize]);

  /** Decorative dots in background. */
  const dots = useMemo(
    () => [
      { left: "72%", top: "16%", size: 52, opacity: 0.25 },
      { left: "86%", top: "42%", size: 38, opacity: 0.22 },
      { left: "64%", top: "70%", size: 44, opacity: 0.18 },
      { left: "12%", top: "62%", size: 36, opacity: 0.22 },
      { left: "18%", top: "28%", size: 28, opacity: 0.2 },
      { left: "42%", top: "18%", size: 22, opacity: 0.2 },
    ],
    []
  );

  // Allow either draftUser or user to proceed; require tableId & seatId.
  useEffect(() => {
    if (!(draftUser || user) || !tableId || !seatIdNum) {
      nav("/role", { replace: true });
    }
  }, [draftUser, user, tableId, seatIdNum, nav]);

  async function handleSeekHelp() {
    const who = draftUser ?? user;
    if (!who) {
      nav("/role", { replace: true });
      return;
    }

    setLoading(true);
    setErr("");

    try {
      const payload = {
        name: who.name,
        avatar: avatarSrc,
        tableId: String(tableId),
        seatId: Number(seatIdNum),
        signals: signals.map((s) => s.text),
      };

      let res: Response;

      if (draftUser) {
        // Create new role
        res = await fetch(`${API}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Update existing role (profile/signals/seat move)
        res = await fetch(`${API}/roles/${encodeURIComponent(user!.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.status === 409) {
        setErr("This seat was taken just now. Please pick another seat.");
        nav("/seat", { replace: true, state: { tableId } });
        return;
      }
      if (res.status === 404) {
        setErr("Table not found. Please re-select your table.");
        nav("/table", { replace: true });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // IMPORTANT: when creating, persist the server-generated id for later (messaging etc.).
      if (draftUser) {
        const data = (await res.json().catch(() => ({}))) as { id?: string | number };
        if (!data?.id) throw new Error("Missing server role id");
        // If your store's commitUser signature differs, update the store accordingly.
        commitUser({ id: String(data.id), name: who.name });
      }

      // Go to Nearby with the current table id for highlighting.
      nav("/nearby", { replace: true, state: { tableId } });
    } catch (e: any) {
      setErr(e?.message ?? "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* Fine grain background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />
      {/* Decorative dots */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {dots.map((d, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: d.left,
              top: d.top,
              width: d.size,
              height: d.size,
              opacity: d.opacity,
              filter: "blur(1px)",
              boxShadow: "0 6px 18px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.45)",
            }}
          />
        ))}
      </div>

      {/* Brand / Table label */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ · Admin</span>
      </header>
      <h1 className="text-center font-display text-[clamp(26px,4.6vw,40px)] -mt-2 mb-2 relative z-10">
        {tableId ? `Table ${tableId}` : "Ready"}
      </h1>

      {/* Stage: render signals at normalized positions + avatar spotlight */}
      <section className="grow grid place-items-center px-4 relative z-10">
        <div
          ref={stageRef}
          className="relative w-full max-w-4xl h-[520px] md:h-[560px] rounded-2xl overflow-visible"
          role="region"
          aria-label="Preview"
        >
          {signals.map((s) => (
            <SignalBubbleView key={s.id} text={s.text} nx={s.nx} ny={s.ny} />
          ))}

          {/* Center avatar */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className="
                rounded-full grid place-items-center
                size-[315px] md:size-[385px]
                bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]
                shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]
                backdrop-blur-md
              "
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Selected avatar"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none"
                />
              ) : null}
            </div>
            <div className="mt-3 text-xl opacity-90 text-center">
              {(draftUser?.name ?? user?.name) || ""}
            </div>
          </div>
        </div>
      </section>

      {/* Primary action */}
      <section className="px-4 pb-10 grid place-items-center relative z-10">
        <button
          onClick={handleSeekHelp}
          disabled={loading}
          className={[
            "relative min-w-[240px] px-6 py-3 rounded-2xl",
            "border border-white/30",
            "bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]",
            "backdrop-blur-xl text-white text-lg font-semibold tracking-wide",
            "shadow-[0_12px_36px_rgba(0,0,0,.35)]",
            "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]",
            "hover:bg-white/20 active:scale-[.99] transition",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          {loading ? "Creating…" : "Initialize Device"}
        </button>
        {err && <div className="mt-3 text-red-200 text-sm">{err}</div>}
      </section>

      {/* Back button */}
      <button
        onClick={() => nav(-1)}
        className="
          fixed bottom-5 right-5 z-20 rounded-full
          border border-white/30 bg-white/10 backdrop-blur
          px-4 py-2 text-sm hover:bg-white/15
        "
        aria-label="Back"
      >
        ← Back
      </button>
    </main>
  );
}

/** Readonly bubble (without tail). */
function SignalBubbleView({ text, nx, ny }: { text: string; nx: number; ny: number }) {
  return (
    <div
      className="absolute z-20 select-none max-w-[300px] rounded-2xl px-4 py-3
                 border border-white/30
                 bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]
                 backdrop-blur-xl text-white/95
                 shadow-[0_10px_28px_rgba(0,0,0,.35)]
                 before:content-[''] before:absolute before:inset-0 before:rounded-2xl
                 before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]"
      style={{
        left: `${(nx * 100).toFixed(2)}%`,
        top: `${(ny * 100).toFixed(2)}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="leading-snug tracking-wide">{text}</div>
    </div>
  );
}

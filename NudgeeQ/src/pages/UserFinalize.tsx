// src/pages/UserFinalize.tsx
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { fetchMyRoleDetail, ensureAvatar } from "./userFlowApi";
import type { UserEditState } from "./userFlowTypes";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

type NormalizedSignal = { id: string; text: string; nx: number; ny: number };
type PixelSignal = { id: string; text: string; x: number; y: number };

function isNormalizedSignal(value: unknown): value is NormalizedSignal {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { nx?: unknown; ny?: unknown; text?: unknown };
  return (
    typeof candidate.nx === "number" &&
    typeof candidate.ny === "number" &&
    typeof candidate.text === "string"
  );
}

export default function UserFinalize() {
  const nav = useNavigate();
  const { state } = useLocation() as {
    state?: UserEditState & { signals?: Array<NormalizedSignal | PixelSignal> };
  };
  const { user, draftUser, setUser, setDraftUser } = useApp();

  const [context, setContext] = useState<UserEditState>({
    tableId: state?.tableId,
    seatId: state?.seatId,
    name: state?.name,
    avatarSrc: state?.avatarSrc,
  });
  const [rawSignals, setRawSignals] = useState<Array<NormalizedSignal | PixelSignal>>(state?.signals ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    const update = () => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) setStageSize({ w: rect.width, h: rect.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!user && !draftUser) {
      nav("/", { replace: true });
      return;
    }
    if (state?.tableId && state?.seatId && state?.avatarSrc && state?.name) return;
    if (!user?.id) return;

    let active = true;
    (async () => {
      try {
        const info = await fetchMyRoleDetail(user.id);
        if (!active) return;
        setContext((prev) => ({
          tableId: prev.tableId ?? info.tableId,
          seatId: prev.seatId ?? info.seatId,
          name: prev.name ?? info.name,
          avatarSrc: prev.avatarSrc ?? info.avatar,
        }));
        if (rawSignals.length === 0 && info.signals.length > 0) {
          setRawSignals(info.signals.map((text) => ({ id: crypto.randomUUID(), text, nx: 0.5, ny: 0.5 })));
        }
      } catch (e: unknown) {
        if (!active) return;
        const message = e instanceof Error ? e.message : "Failed to load your profile.";
        setError(message);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, draftUser, nav, state, rawSignals.length]);

  const signals = useMemo<NormalizedSignal[]>(() => {
    return rawSignals.map((s) => {
      if (isNormalizedSignal(s)) return s;
      const px = s as PixelSignal;
      const nx = (px.x ?? 0) / (stageSize.w || 1);
      const ny = (px.y ?? 0) / (stageSize.h || 1);
      return { id: px.id, text: px.text, nx, ny };
    });
  }, [rawSignals, stageSize]);

  const displayName = context.name ?? draftUser?.name ?? user?.name ?? "";
  const avatarSrc = ensureAvatar(context.avatarSrc);

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

  const saveChanges = async () => {
    if (!draftUser && !user) {
      nav("/", { replace: true });
      return;
    }
    if (!context.tableId || !context.seatId) {
      setError("Missing table or seat information. Please restart the edit flow.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        name: displayName,
        avatar: avatarSrc,
        tableId: context.tableId,
        seatId: Number(context.seatId),
        signals: signals.map((s) => s.text),
      };

      const createRes = await fetch(`${API}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (createRes.status === 409) {
        setError("This seat was just claimed. Please contact an admin to resolve.");
        return;
      }
      if (createRes.status === 404) {
        setError("Table not found. Please contact an admin.");
        return;
      }
      if (!createRes.ok) throw new Error(`HTTP ${createRes.status}`);

      const created = (await createRes.json().catch(() => ({}))) as { id?: string | number };
      const newId = created?.id ? String(created.id) : "";
      if (!newId) throw new Error("Missing role id from server");

      setUser({ id: newId, name: payload.name, avatar: payload.avatar });
      setDraftUser(undefined);
      nav("/nearby", { replace: true, state: { tableId: context.tableId } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update role.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

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

      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>
      <h1 className="text-center font-display text-[clamp(26px,4.6vw,40px)] -mt-2 mb-2 relative z-10">
        {context.tableId ? `Table ${context.tableId}` : "Ready"}
      </h1>

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

          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="
                rounded-full grid place-items-center
                size-[315px] md:size-[385px]
                bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]
                shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]
                backdrop-blur-md
              "
            >
              <img
                src={avatarSrc}
                alt="Selected avatar"
                className="w-[72%] h-[72%] object-contain select-none pointer-events-none"
              />
            </div>
            <div className="mt-3 text-xl opacity-90 text-center">{displayName}</div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 grid place-items-center relative z-10">
        <button
          onClick={saveChanges}
          disabled={loading}
          className="
            relative min-w-[240px] px-6 py-3 rounded-2xl
            border border-white/30
            bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]
            backdrop-blur-xl text-white text-lg font-semibold tracking-wide
            shadow-[0_12px_36px_rgba(0,0,0,.35)]
            before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]
            hover:bg-white/20 active:scale-[.99] transition
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {loading ? "Creating…" : "Seek Help"}
        </button>
        {error && <div className="mt-3 text-red-200 text-sm text-center">{error}</div>}
      </section>

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

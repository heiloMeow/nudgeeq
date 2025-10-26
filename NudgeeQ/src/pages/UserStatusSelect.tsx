// src/pages/UserStatusSelect.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { fetchMyRoleDetail, ensureAvatar } from "./userFlowApi";
import type { UserEditState } from "./userFlowTypes";

const AVATAR_BASE = "/avatars";
const COLORS = ["colorful", "brown", "white", "white2", "yellow"] as const;
type Color = (typeof COLORS)[number];
type Status = "smile" | "okay" | "normal" | "annoying";
type Gender = "female" | "male";

const STATUS_OPTS: { value: Status; label: string }[] = [
  { value: "smile", label: "Happy" },
  { value: "okay", label: "All Good" },
  { value: "normal", label: "Working" },
  { value: "annoying", label: "Annoying" },
];

export default function UserStatusSelect() {
  const nav = useNavigate();
  const { user, draftUser } = useApp();
  const { state } = useLocation() as { state?: UserEditState };

  const [base, setBase] = useState<UserEditState>(state ?? {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const derived = useMemo(() => parseAvatar(base.avatarSrc ?? "/avatars/white-normal.png"), [base.avatarSrc]);
  const [gender, setGender] = useState<Gender>(derived.gender);
  const [selectedColor, setSelectedColor] = useState<Color>(derived.color);
  const [selectedStatus, setSelectedStatus] = useState<Status>(derived.status);
  const [colorIndex, setColorIndex] = useState<number>(COLORS.indexOf(derived.color));

  useEffect(() => {
    if (!user && !draftUser) {
      nav("/", { replace: true });
      return;
    }
    if (state?.tableId && state?.seatId && state?.avatarSrc) return;
    if (!user?.id) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
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
        if (!state?.avatarSrc) {
          const parsed = parseAvatar(info.avatar);
          setGender(parsed.gender);
          setSelectedColor(parsed.color);
          setSelectedStatus(parsed.status);
          setColorIndex(COLORS.indexOf(parsed.color));
        }
      } catch (e: unknown) {
        if (!active) return;
        const message = e instanceof Error ? e.message : "Failed to load avatar.";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, draftUser, nav, state]);

  useEffect(() => {
    setSelectedColor(COLORS[colorIndex]);
  }, [colorIndex]);

  const visibleColors = useMemo(() => {
    const out: Color[] = [];
    for (let i = -2; i <= 2; i++) {
      const idx = (colorIndex + i + COLORS.length) % COLORS.length;
      out.push(COLORS[idx]);
    }
    return out;
  }, [colorIndex]);

  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let x0 = 0;
    let dx = 0;
    const start = (e: TouchEvent) => {
      x0 = e.touches[0].clientX;
      dx = 0;
    };
    const move = (e: TouchEvent) => {
      dx = e.touches[0].clientX - x0;
    };
    const end = () => {
      if (Math.abs(dx) > 40) {
        if (dx < 0) nextColor();
        else prevColor();
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevColor();
      if (e.key === "ArrowRight") nextColor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prevColor = () => setColorIndex((i) => (i - 1 + COLORS.length) % COLORS.length);
  const nextColor = () => setColorIndex((i) => (i + 1) % COLORS.length);

  const confirmAvatar = () => {
    if (!base.tableId || !base.seatId) {
      setError("Unable to determine your seat. Please retry.");
      return;
    }
    const avatarSrc = srcOf(gender, selectedColor, selectedStatus);
    nav("/user/signal", {
      state: {
        ...base,
        name: base.name ?? user?.name ?? "",
        avatarSrc,
      },
    });
  };

  return (
    <main
      className="
        relative min-h-svh overflow-hidden flex items-center justify-center text-white px-8
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
      role="region"
      aria-roledescription="carousel"
      aria-label="Avatar selector"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.12]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />
      <span aria-hidden className="absolute rounded-full bg-white/1 w-[120px] h-[120px] top-[18%] left-[9%]" />
      <span aria-hidden className="absolute rounded-full bg-white/5 w-[80px]  h-[80px]  bottom-[14%] right-[10%]" />

      <div className="absolute top-10 left-12 text-white font-semibold text-[1.5rem] tracking-tight">
        NudgeeQ
      </div>

      <div className="text-center w-full max-w-[1100px]">
        <h5 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 1</h5>
        <h1 className="text-[clamp(28px,6vw,56px)] font-semibold text-white mb-4 tracking-wide">
          Select Your Avatar
        </h1>

        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full bg-white/15 backdrop-blur border border-white/25 p-1">
            {(["female", "male"] as Gender[]).map((g) => {
              const active = gender === g;
              return (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={[
                    "px-5 py-1.5 rounded-full text-sm font-medium transition",
                    active
                      ? "bg-white/30 border border-white/40 shadow-[0_2px_8px_rgba(0,0,0,.25)]"
                      : "hover:bg-white/20",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {g === "female" ? "Female" : "Male"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 md:gap-10 mb-8">
          <button
            type="button"
            onClick={prevColor}
            aria-label="Previous color"
            className="p-3 -m-3 text-2xl opacity-70 hover:opacity-100
                      rounded-full focus-visible:outline-2 focus-visible:outline-white/90 focus-visible:outline-offset-2
"
          >
            ‹
          </button>
          <div ref={trackRef} className="flex items-center justify-center gap-6 h-[220px]">
            {visibleColors.map((color, idx) => {
              const role = idx === 2 ? "center" : idx === 1 || idx === 3 ? "side" : "far";
              const sizeCls =
                role === "center"
                  ? "w-[180px] h-[180px]"
                  : role === "side"
                  ? "w-[142px] h-[142px]"
                  : "w-[106px] h-[106px]";
              const opacityCls =
                role === "center" ? "opacity-100" : role === "side" ? "opacity-[.85]" : "opacity-60";
              const scaleCls =
                role === "center" ? "scale-100" : role === "side" ? "scale-[0.88]" : "scale-[0.72]";
              const zCls = role === "center" ? "z-30" : role === "side" ? "z-20" : "z-10";

              return (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setColorIndex(COLORS.indexOf(color));
                  }}
                  className={[
                    "transition-all duration-300 ease-out flex items-center justify-center cursor-pointer",
                    sizeCls,
                    opacityCls,
                    zCls,
                    scaleCls,
                  ].join(" ")}
                  aria-label={`Pick color ${color}`}
                >
                  <div
                    className={[
                      "rounded-full p-[14px] bg-white/18 backdrop-blur",
                      "shadow-[0_10px_36px_rgba(0,0,0,.25)] border border-white/35",
                      role === "center" ? "p-5 border-2 shadow-[0_16px_44px_rgba(0,0,0,.35)]" : "",
                      "w-full h-full grid place-items-center",
                    ].join(" ")}
                  >
                    <img
                      src={srcOf(gender, color, selectedStatus)}
                      alt={`${gender} ${color} ${selectedStatus}`}
                      className="w-full h-full object-contain rounded-full select-none"
                      draggable={false}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={nextColor}
            aria-label="Next color"
            className="p-3 -m-3 text-2xl opacity-70 hover:opacity-100
                      rounded-full focus-visible:outline-2 focus-visible:outline-white/90 focus-visible:outline-offset-2
"
          >
            ›
          </button>
        </div>

        <div className="flex gap-10 justify-center my-10 flex-wrap">
          {STATUS_OPTS.map((s) => {
            const selected = selectedStatus === s.value;
            return (
              <div key={s.value} className="flex flex-col items-center gap-3">
                <button
                  onClick={() => setSelectedStatus(s.value)}
                  className={[
                    "p-2 rounded-full bg-white/15 backdrop-blur border-2 border-transparent transition",
                    selected
                      ? "border-blue-600/80 bg-white/25 shadow-[0_6px_18px_rgba(37,99,235,.38)]"
                      : "hover:scale-[1.05] hover:bg-white/20",
                  ].join(" ")}
                  aria-pressed={selected}
                  aria-label={s.label}
                  title={s.label}
                >
                  <img
                    src={srcOf(gender, selectedColor, s.value)}
                    alt={s.label}
                    className="w-[110px] h-[110px] rounded-full object-contain block select-none"
                    draggable={false}
                  />
                </button>
                <p className="m-0 text-white text-[1.05rem] font-medium">{s.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pb-10">
          <button
            onClick={confirmAvatar}
            disabled={loading}
            className="
              mt-2 px-12 py-4 text-white font-semibold text-[1.1rem] rounded-[30px]
              bg-white/30 border-2 border-white/50 backdrop-blur
              shadow-[0_4px_15px_rgba(0,0,0,.2)]
              hover:bg-white/40 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,.3)]
              disabled:opacity-60
            "
          >
            That's Me
          </button>
          {error && <div className="mt-3 text-sm text-red-200">{error}</div>}
        </div>
      </div>

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

function parseAvatar(src: string): { gender: Gender; color: Color; status: Status } {
  const normalized = ensureAvatar(src);
  const file = normalized.split("/").pop() ?? "";
  const match = file.match(/^(colorful|brown|white2|white|yellow)(man)?-(smile|okay|normal|annoying)\.png/i);
  const color = (match?.[1] ?? "white") as Color;
  const gender: Gender = match?.[2] ? "male" : "female";
  const status = (match?.[3] ?? "normal") as Status;
  return { gender, color, status };
}

function srcOf(gender: Gender, c: Color | string, s: Status | string) {
  return `${AVATAR_BASE}/${encodeURIComponent(c)}${gender === "male" ? "man" : ""}-${encodeURIComponent(s)}.png`;
}

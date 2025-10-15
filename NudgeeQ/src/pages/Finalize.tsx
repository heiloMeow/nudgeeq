// src/pages/Finalize.tsx
import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type SignalItem = { id: string; text: string; nx: number; ny: number };

const { state } = useLocation() as {
  state?: { tableId?: string; seatId?: string; avatarSrc?: string; signals?: SignalItem[] };
};

const signals = state?.signals ?? [];

/* 只读展示版气泡（无尾巴、不可拖拽/删除） */
function SignalBubbleView({ text, nx, ny }:{ text:string; nx:number; ny:number }) {
  return (
    <div
      className="absolute z-20 select-none max-w-[300px] rounded-2xl px-4 py-3
                 border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,.18)_0%,rgba(255,255,255,.08)_100%)]
                 backdrop-blur-xl text-white/95 shadow-[0_10px_28px_rgba(0,0,0,.35)]
                 before:content-[''] before:absolute before:inset-0 before:rounded-2xl
                 before:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]"
      style={{
        left: `${(nx * 100).toFixed(2)}%`,
        top:  `${(ny * 100).toFixed(2)}%`,
        transform: "translate(-50%,-50%)"
      }}
    >
      <div className="leading-snug tracking-wide">{text}</div>
    </div>
  );
}


export default function Finalize() {
  const nav = useNavigate();
  const { state } = useLocation() as {
    state?: { tableId?: string; seatId?: string; avatarSrc?: string; signals?: SignalItem[] };
  };
  const { draftUser, commitUser } = useApp();

  const tableId = state?.tableId ?? "";
  const seatId = state?.seatId ?? "";
  const avatarSrc = state?.avatarSrc ?? "";
  const signals = state?.signals ?? [];

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 背景小圆点装饰（位置/大小/透明度）
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

  useEffect(() => {
    if (!draftUser || !tableId || !seatId) nav("/role", { replace: true });
  }, []);

  async function handleSeekHelp() {
    if (!draftUser) return;
    setLoading(true); setErr("");
    try {
      const payload = {
        id: draftUser.id,
        name: draftUser.name,
        tableId,
        seatId,
        avatar: avatarSrc,
        signals: signals.map(s => ({ text: s.text, nx: s.nx, ny: s.ny })),

        createdAt: new Date().toISOString(),
      };
      const res = await fetch(`${API_BASE}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      commitUser();
      nav("/room", { replace: true });
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
      {/* 细纹底纹 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />
      {/* 装饰小圆点 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {dots.map((d, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: d.left, top: d.top,
              width: d.size, height: d.size,
              opacity: d.opacity,
              filter: "blur(1px)",
              boxShadow: "0 6px 18px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.45)",
            }}
          />
        ))}
      </div>

      {/* 顶部品牌 + 桌号 */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>
      <h1 className="text-center font-display text-[clamp(26px,4.6vw,40px)] -mt-2 mb-2 relative z-10">
        {tableId ? `Table ${tableId}` : "Ready"}
      </h1>

      {/* 舞台：保留 signal + 放大头像（75%） */}
      <section className="grow grid place-items-center px-4 relative z-10">
        <div
          className="relative w-full max-w-4xl h-[520px] md:h-[560px] rounded-2xl overflow-visible"
          role="region"
          aria-label="Preview"
        >
          {/* 展示 signals（按 Step4 记录的位置渲染） */}
          {signals.map(s => (
             <SignalBubbleView key={s.id} text={s.text} nx={s.nx} ny={s.ny} />
          ))}
          {/* 中心头像（从 180/220 放大到 315/385） */}
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
            <div className="mt-3 text-xl opacity-90 text-center">{draftUser?.name}</div>
          </div>
        </div>
      </section>

      {/* 中央唯一按钮：Seek Help = 最终创建 */}
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
          {loading ? "Creating…" : "Seek Help"}
        </button>
        {err && <div className="mt-3 text-red-200 text-sm">{err}</div>}
      </section>

      {/* 右下角返回 */}
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

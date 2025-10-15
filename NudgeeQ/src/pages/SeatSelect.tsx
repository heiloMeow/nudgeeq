// src/pages/SeatSelect.tsx
import { useState } from "react";
import type { ReactNode } from "react";

export default function SeatSelect({
  tableId,
  onBack,
  onNext,
  total = 6, // 两边各 3 个
}: {
  tableId: string;
  onBack: () => void;
  onNext: (seatId: string) => void;
  total?: 6;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const ids = Array.from({ length: total }, (_, i) => String(i + 1)); // "1".."6"

  const continueNext = () => picked && onNext(picked);

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* 背景细纹 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.12]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      {/* 顶部品牌 */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      {/* 标题 */}
      <section className="px-4 relative z-10">
        <h2 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 2</h2>
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Select Your Seat</h1>
      </section>

      {/* 桌子卡片 */}
      <section className="grow grid place-items-center px-4 pb-24 relative z-10">
        {/* 中间细长矩形桌 + 外侧座位（兄弟节点） */}
            <div className="relative mx-auto w-full max-w-[420px] h-[380px] sm:h-[380px] md:h-[210px]">
            {/* 左侧三座位（在矩形外侧） */}
            <div className="absolute -left-[56px] top-6 bottom-6 flex flex-col items-center justify-between gap-6">

                {ids.slice(0, 3).map((id) => (
                <SeatDot key={id} id={id} active={picked === id} onPick={() => setPicked(id)} />
                ))}
            </div>

            {/* 细长矩形桌面本体（居中） */}
            <div
                className="
                h-full rounded-[16px] bg-white/6 border border-white/20 overflow-visible
                shadow-[inset_0_1px_0_rgba(255,255,255,.25)] relative
                "
            >
                {/* 只保留居中的 #桌号水印 */}
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="font-display text-[56px] md:text-[64px] text-white/12 select-none">#{tableId}</span>
                </div>
            </div>

            {/* 右侧三座位（在矩形外侧） */}
           <div className="absolute -right-[56px] top-6 bottom-6 flex flex-col items-center justify-between gap-6">

                {ids.slice(3, 6).map((id) => (
                <SeatDot key={id} id={id} active={picked === id} onPick={() => setPicked(id)} />
                ))}
            </div>
            </div>

      </section>

      {/* 下方按钮区 */}
      <section className="px-4 pb-4 grid place-items-center relative z-10">
        <button
          onClick={continueNext}
          disabled={!picked}
          className="min-w-[180px] rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
        >
          Continue
        </button>
      </section>

      {/* 右下角返回 */}
      <button
        onClick={onBack}
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

function SeatDot({
  id,
  active,
  onPick,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={[
        "z-20 size-[70px] rounded-full grid place-items-center text-xl",
        "border", active ? "border-white/70" : "border-white/30",
        active ? "bg-white/25" : "bg-white/18",
        "backdrop-blur-sm hover:bg-white/24 transition",
        "shadow-[0_8px_20px_rgba(0,0,0,.35)]",
      ].join(" ")}
      aria-pressed={active}
      aria-label={`Seat ${id}`}
      title={`Seat ${id}`}
    >
      {id}
    </button>
  );
}

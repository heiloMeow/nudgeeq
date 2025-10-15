// src/pages/TableSelect.tsx
import { useState } from "react";


export default function TableSelect({
  onBack,
  onNext,            // 选好并 Continue 后进入下一步
}: {
  onBack: () => void;
  onNext: (tableId: string) => void;
}) {

  const [picked, setPicked] = useState<string | null>(null);

  function continueNext() {
    if (!picked) return;

    onNext(picked);
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        /* 背景：上粉紫光晕 + 底部深色 + 桌面暗纹 */
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* 桌面拉丝/暗纹效果（叠加一层） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.12]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      <section className="px-4 relative z-10">
        <h2 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 1</h2>
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Select Your Table</h1>
      </section>

      {/* 桌子卡片 */}
      <section className="grow grid place-items-center px-4 pb-24 relative z-10">
        <div
          className="
            w-full max-w-4xl rounded-[24px] p-8
            border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)]
            relative
          "
        >
          {/* 十字分割线 */}
          <div className="absolute inset-8 pointer-events-none">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
          </div>

          <div className="grid grid-cols-2 gap-y-16 gap-x-20 justify-items-center">
            {["1","2","3","4"].map((id) => (
              <Seat key={id} id={id} active={picked === id} onPick={() => setPicked(id)} />
            ))}
          </div>
        </div>
      </section>

      {/* 下方按钮区 */}
      <section className="px-4 pb-4 grid place-items-center relative z-10">
        <button
          onClick={continueNext}
          disabled={!picked}
          className="
            min-w-[180px] rounded-lg py-2
            bg-brand-500 hover:bg-brand-700 disabled:opacity-50
          "
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

function Seat({
  id, active, onPick,
}: { id: string; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={[
        "relative z-10 size-[84px] rounded-full grid place-items-center",
        "border", active ? "border-white/70" : "border-white/30",
        active ? "bg-white/25" : "bg-white/18",
        "backdrop-blur-sm hover:bg-white/24",
        "text-xl",
      ].join(" ")}
      aria-pressed={active}
      aria-label={`Seat ${id}`}
    >
      {id}
    </button>
  );
}

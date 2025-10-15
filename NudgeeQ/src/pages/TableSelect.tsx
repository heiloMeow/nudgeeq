// src/pages/TableSelect.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TableSelect({
  tables = ["1", "2", "3", "4"], // 想要更多桌子，改这里或从外部传入
}: {
  tables?: string[];
}) {
  const nav = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);

  const goNext = () => {
    if (!picked) return;
    nav("/seat", { state: { tableId: picked } }); // 传给 Step 2
  };

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
          role="group"
          aria-label="Tables"
        >
          {/* 十字分割线（装饰） */}
          <div className="absolute inset-8 pointer-events-none">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
          </div>

          {/* 四个圆点（桌号）—— 你要更多就扩容 tables */}
          <div className="grid grid-cols-2 gap-y-16 gap-x-20 justify-items-center">
            {tables.slice(0, 4).map((id, i) => (
              <TableDot
                key={id}
                id={id}
                active={picked === id}
                onPick={() => setPicked(id)}
                ariaPos={i + 1}
                ariaCount={Math.min(4, tables.length)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 下方按钮区 */}
      <section className="px-4 pb-4 grid place-items-center relative z-10">
        <button
          onClick={goNext}
          disabled={!picked}
          className="min-w-[180px] rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
        >
          Continue
        </button>
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

function TableDot({
  id,
  active,
  onPick,
  ariaPos,
  ariaCount,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
  ariaPos: number;
  ariaCount: number;
}) {
  return (
    <button
      onClick={onPick}
      className={[
        "relative z-10 size-[84px] rounded-full grid place-items-center text-xl",
        "border", active ? "border-white/70" : "border-white/30",
        active ? "bg-white/25" : "bg-white/18",
        "backdrop-blur-sm hover:bg-white/24 transition",
        "shadow-[0_8px_20px_rgba(0,0,0,.35)]",
      ].join(" ")}
      aria-pressed={active}
      aria-label={`Table ${id}`}
      aria-posinset={ariaPos}
      aria-setsize={ariaCount}
    >
      {id}
    </button>
  );
}

// src/pages/TableSelect.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

type TableBrief = { id: string | number };

export default function TableSelect() {
  const nav = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tables, setTables] = useState<TableBrief[]>([]);

  async function load() {
    try {
      setErr("");
      setLoading(true);
      // 这里用 limit=60 拿一批；后端无 near 参数时会按默认顺序返回前 N 个
      const res = await fetch(`${API_BASE}/tables?limit=60`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Array<{ id: string | number }>;
      // 只要 id；后续选座再按 /tables/:id 拿占用详情
      const list = data.map(d => ({ id: d.id }));
      setTables(list);
    } catch (e: any) {
      setErr(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const ids = useMemo(() => tables.map(t => String(t.id)), [tables]);

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
      <header className="px-7 py-6 relative z-10 flex items-center gap-3">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
        <span className="opacity-70 text-sm">·</span>
        <span className="opacity-80 text-sm">Step 1</span>
        <button
          onClick={() => nav(-1)}
          className="ml-auto rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/15"
          aria-label="Back"
        >
          ← Back
        </button>
      </header>

      {/* 标题 */}
      <section className="px-4 relative z-10">
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Select Your Table</h1>
        <p className="text-center text-white/80 mt-1">Pick a table to continue to seat selection.</p>
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

          {/* 内容区 */}
          {loading ? (
            <DotSkeleton />
          ) : err ? (
            <div className="text-center py-12">
              <div className="text-red-200 mb-3">Failed to load tables: {err}</div>
              <button
                onClick={load}
                className="rounded-lg px-4 py-2 bg-white/15 border border-white/25 hover:bg-white/25"
              >
                Retry
              </button>
            </div>
          ) : ids.length === 0 ? (
            <div className="text-center py-12 text-white/80">No tables found.</div>
          ) : (
            <div
              className="
                grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4
                gap-y-10 gap-x-8 justify-items-center
              "
            >
              {ids.map((id, i) => (
                <TableDot
                  key={id}
                  id={id}
                  active={picked === id}
                  onPick={() => setPicked(id)}
                  ariaPos={i + 1}
                  ariaCount={ids.length}
                />
              ))}
            </div>
          )}
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
      title={`Table ${id}`}
    >
      {id}
    </button>
  );
}

/* Skeleton 占位（加载时的虚影圆点） */
function DotSkeleton() {
  const ph = new Array(8).fill(0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-10 gap-x-8 justify-items-center">
      {ph.map((_, i) => (
        <div
          key={i}
          className="size-[84px] rounded-full bg-white/10 border border-white/15 animate-pulse"
        />
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";

/** 运行在 Vite：public 目录静态文件可用 /avatars/<filename> 直接访问 */
const BASE = "/avatars";

/** 你的资源清单（来自 public/avatars） */
const RAW_FILES = [
  // ---- Female (不含“男”) ----
  "brown-annoying.png","brown-normal.png","brown-okay.png","brown-smile.png",
  "colorful-annoying.png","colorful-normal.png","colorful-okay.png","colorful-smile.png",
  "white-annoying.png","white-normal.png","white-okay.png","white-smile.png",
  "white2-annoying.png","white2-normal.png","white2-okay.png","white2-smile.png",
  "yellow-annoying.png","yellow-normal.png","yellow-okay.png","yellow-smile.png",
  // ---- Male (含“男”) ----
  "彩男- annoying.png","彩男- normal.png","彩男-Okay.png","彩男-smile.png",
  "棕男- annoying.png","棕男-Okay.png","棕男-smile.png","棕男-working.png",
  "白男- annoying.png","白男- normal.png","白男-okay.png","白男-Smile.png",
  "白男2- annoying.png","白男2-normal.png","白男2-Okay.png","白男2-smile.png",
  "黄男- annoying.png","黄男-normal.png","黄男-Okay.png","黄男-smile.png",
] as const;

type Gender = "female" | "male";
type Tone   = "white" | "white2" | "yellow" | "brown" | "colorful";
type Expr   = "smile" | "okay" | "normal" | "annoying" | "working";

type Avatar = {
  gender: Gender;
  tone: Tone;
  expr: Expr;
  file: string;     // 原始文件名（带大小写/空格）
  src: string;      // /avatars/xxx.png
};

/** 显示用文案（你可以按喜好改） */
const EXPR_LABEL: Record<Expr, string> = {
  smile: "Happy",
  okay: "All Good",
  normal: "Normal",
  annoying: "Annoyed",
  working: "Working",
};

/** 中文“男”系列映射到 tone */
const ZH_MALE_PREFIX_TO_TONE: Record<string, Tone> = {
  "彩男": "colorful",
  "棕男": "brown",
  "白男2": "white2",
  "白男": "white",
  "黄男": "yellow",
};

/** 解析文件名 -> Avatar 元信息 */
function parseFile(file: string): Avatar | null {
  const src = `${BASE}/${encodeURIComponent(file)}`;
  const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");

  // 男：包含“男”
  if (base.includes("男")) {
    const prefix = Object.keys(ZH_MALE_PREFIX_TO_TONE).find((p) => base.startsWith(p));
    if (!prefix) return null;
    const tone = ZH_MALE_PREFIX_TO_TONE[prefix];
    // 取“-”后面的表达式；去空格并小写
    const part = base.split("-").slice(1).join("-").trim().toLowerCase();
    // 兼容 Okay/Smile/ normal 前有空格
    const exprNorm = part.replace(/\s+/g, "");
    let expr: Expr | null = null;
    if (/(^|-)smile$/.test(exprNorm)) expr = "smile";
    else if (/(^|-)okay$/.test(exprNorm)) expr = "okay";
    else if (/(^|-)normal$/.test(exprNorm)) expr = "normal";
    else if (/(^|-)annoying$/.test(exprNorm)) expr = "annoying";
    else if (/(^|-)working$/.test(exprNorm)) expr = "working";
    if (!expr) return null;

    return { gender: "male", tone, expr, file, src };
  }

  // 女：格式如 white2-smile
  const m = base.match(/^(white2|white|yellow|brown|colorful)[-\s]([a-zA-Z]+)$/i);
  if (!m) return null;
  const tone = m[1].toLowerCase() as Tone;
  const e = m[2].toLowerCase();
  const map: Record<string, Expr> = { smile: "smile", okay: "okay", normal: "normal", annoying: "annoying", working: "working" };
  const expr = map[e];
  if (!expr) return null;
  return { gender: "female", tone, expr, file, src };
}

const AVATARS: Avatar[] = RAW_FILES.map(parseFile).filter(Boolean) as Avatar[];

/* ========================================================== */

export default function StatusSelect({
  onBack,            // 返回（右下角）
  onDone,            // 点击 That's It，返回所选 avatar 元信息
}: {
  onBack: () => void;
  onDone: (picked: Avatar) => void;
}) {
  // 过滤条件
  const [gender, setGender] = useState<Gender>("female");
  const [tone, setTone]     = useState<Tone | "any">("any");
  const [expr, setExpr]     = useState<Expr | "any">("any");

  // 过滤后的列表
  const list = useMemo(() => {
    return AVATARS.filter(a =>
      a.gender === gender &&
      (tone === "any" || a.tone === tone) &&
      (expr === "any" || a.expr === expr)
    );
  }, [gender, tone, expr]);

  // 轮播索引
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [gender, tone, expr]); // 改筛选时重置索引

  const cur = list[idx];

  // 供筛选器展示的选项
  const tonesForGender = useMemo(() => {
    const s = new Set<Tone>();
    for (const a of AVATARS) if (a.gender === gender) s.add(a.tone);
    return Array.from(s);
  }, [gender]);

  const exprForSelection = useMemo(() => {
    const s = new Set<Expr>();
    for (const a of AVATARS) if (a.gender === gender && (tone === "any" || a.tone === tone)) s.add(a.expr);
    return Array.from(s);
  }, [gender, tone]);

  // 键盘左右键导航
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const prev = () => setIdx(i => (list.length ? (i - 1 + list.length) % list.length : 0));
  const next = () => setIdx(i => (list.length ? (i + 1) % list.length : 0));
  const pick = () => { if (cur) onDone(cur); };

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* 背景细纹 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]" />

      {/* 顶部品牌 */}
      <header className="px-7 py-6">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      {/* 标题 */}
      <section className="px-4">
        <h2 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 3</h2>
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Pick Your Status</h1>
        <p className="text-center mt-2 opacity-85">Edit My Avatar</p>
      </section>

      {/* 筛选器 */}
      <section className="px-4 mt-4 flex flex-wrap gap-3 justify-center">
        <Select value={gender} onChange={v => setGender(v as Gender)} label="Gender">
          <option value="female">Female</option>
          <option value="male">Male</option>
        </Select>

        <Select value={tone} onChange={v => setTone(v as any)} label="Skin">
          <option value="any">Any</option>
          {tonesForGender.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <Select value={expr} onChange={v => setExpr(v as any)} label="Expression">
          <option value="any">Any</option>
          {exprForSelection.map(e => (
            <option key={e} value={e}>{EXPR_LABEL[e]}</option>
          ))}
        </Select>
      </section>

      {/* 轮播 */}
      <section className="grow grid place-items-center px-4 py-6">
        <div className="relative w-full max-w-4xl">
          {/* 左右箭头 */}
          <button
            onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl opacity-70 hover:opacity-100"
            aria-label="Previous"
          >«</button>
          <button
            onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-3xl opacity-70 hover:opacity-100"
            aria-label="Next"
          >»</button>

          {/* 三个气泡：左预览 / 中心大图 / 右预览 */}
          <div className="grid grid-cols-3 items-center">
            <Bubble size="lg" dim>
              {list.length ? <img src={list[(idx - 1 + list.length) % list.length].src} alt="" className="w-full h-full object-contain rounded-full" /> : null}
            </Bubble>

            <Bubble size="xl">
              {cur ? <img src={cur.src} alt={`${cur.tone} ${cur.expr}`} className="w-full h-full object-contain rounded-full" /> : null}
            </Bubble>

            <Bubble size="lg" dim>
              {list.length ? <img src={list[(idx + 1) % list.length].src} alt="" className="w-full h-full object-contain rounded-full" /> : null}
            </Bubble>
          </div>

          {/* 当前表达文案 */}
          <div className="text-center mt-4 text-xl">{cur ? EXPR_LABEL[cur.expr] : "No result"}</div>
        </div>
      </section>

      {/* 底部确认按钮 */}
      <section className="px-4 pb-16 grid place-items-center">
        <button
          onClick={pick}
          disabled={!cur}
          className="min-w-[180px] rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
        >
          That’s It
        </button>
      </section>

      {/* 右下角返回（你要的） */}
      <button
        onClick={onBack}
        className="fixed bottom-5 right-5 z-20 rounded-full border border-white/30 bg-white/10 backdrop-blur px-4 py-2 text-sm hover:bg-white/15"
        aria-label="Back"
      >
        ← Back
      </button>
    </main>
  );
}

/* ========== 小组件们 ========== */

function Select({
  value, onChange, label, children,
}: { value: string; onChange: (v: string)=>void; label: string; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex items-center gap-2">
      <span className="text-sm opacity-85">{label}</span>

      <span className="relative inline-block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // 关键：自定义底色/文字 + 兼容选项面板
          className="
            appearance-none pl-3 pr-8 py-2 rounded-md
            bg-white/10 text-white border border-white/25 backdrop-blur
            hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/50
            [&>option]:bg-[#151821] [&>option]:text-white
          "
        >
          {children}
        </select>
        {/* 自定义箭头 */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-80"
        >
          ▾
        </span>
      </span>
    </label>
  );
}


function Bubble({ size, dim=false, children }: { size: "lg"|"xl"; dim?: boolean; children?: React.ReactNode }) {
  const cls = size === "xl" ? "size-[220px] md:size-[260px]" : "size-[160px] md:size-[180px]";
  return (
    <div
      className={[
        "mx-auto rounded-full grid place-items-center",
        "bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]",
        "shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]",
        "backdrop-blur-md",
        dim ? "opacity-60" : "opacity-100",
        cls,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

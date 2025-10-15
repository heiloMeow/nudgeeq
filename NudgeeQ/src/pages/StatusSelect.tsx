// src/pages/StatusSelect.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** 静态资源目录：放在 public/avatars 下，页面里用 /avatars/<filename> 访问 */
const BASE = "/avatars";

/** 你的资源清单（文件名来自 public/avatars） */
const RAW_FILES = [
  // ---- Female（不含“男”）----
  "brown-annoying.png","brown-normal.png","brown-okay.png","brown-smile.png",
  "colorful-annoying.png","colorful-normal.png","colorful-okay.png","colorful-smile.png",
  "white-annoying.png","white-normal.png","white-okay.png","white-smile.png",
  "white2-annoying.png","white2-normal.png","white2-okay.png","white2-smile.png",
  "yellow-annoying.png","yellow-normal.png","yellow-okay.png","yellow-smile.png",
  // ---- Male（包含“男”）----
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
  file: string;
  src: string;
};

const EXPR_LABEL: Record<Expr, string> = {
  smile: "Happy",
  okay: "All Good",
  normal: "Normal",
  annoying: "Annoyed",
  working: "Working",
};

const ZH_MALE_PREFIX_TO_TONE: Record<string, Tone> = {
  "彩男": "colorful",
  "棕男": "brown",
  "白男2": "white2",
  "白男": "white",
  "黄男": "yellow",
};

function parseFile(file: string): Avatar | null {
  const src = `${BASE}/${encodeURIComponent(file)}`;
  const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");

  // 男：文件名包含“男”
  if (base.includes("男")) {
    const prefix = Object.keys(ZH_MALE_PREFIX_TO_TONE).find((p) => base.startsWith(p));
    if (!prefix) return null;
    const tone = ZH_MALE_PREFIX_TO_TONE[prefix];
    const raw = base.split("-").slice(1).join("-").trim().toLowerCase().replace(/\s+/g, "");
    let expr: Expr | null = null;
    if (/(^|-)smile$/.test(raw)) expr = "smile";
    else if (/(^|-)okay$/.test(raw)) expr = "okay";
    else if (/(^|-)normal$/.test(raw)) expr = "normal";
    else if (/(^|-)annoying$/.test(raw)) expr = "annoying";
    else if (/(^|-)working$/.test(raw)) expr = "working";
    if (!expr) return null;
    return { gender: "male", tone, expr, file, src };
  }

  // 女：white2-smile / white-smile / yellow-okay 等
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

/* ===================================================== */

export default function StatusSelect() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { tableId?: string; seatId?: string } };
  const tableId = state?.tableId;
  const seatId  = state?.seatId;

  // 筛选条件
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

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [gender, tone, expr]);

  const cur = list[idx];

  // 可选项集合
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

  // 键盘左右切换
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

  // 完成：带着头像去 Step 4
  const goNext = () => {
    if (!cur) return;
    nav("/signal", { state: { tableId, seatId, avatarSrc: cur.src } });
  };

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

      {/* 顶部品牌与标题 */}
      <header className="px-7 py-6">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      <section className="px-4">
        <h2 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 3</h2>
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Pick Your Status</h1>
        <p className="text-center mt-2 opacity-85">Edit My Avatar</p>
      </section>

      {/* 筛选器（深色下拉 + 白字） */}
      <section className="px-4 mt-4 flex flex-wrap gap-3 justify-center">
        <Select value={gender} onChange={v => setGender(v as Gender)} label="Gender">
          <option value="female">Female</option>
          <option value="male">Male</option>
        </Select>

        <Select value={tone} onChange={v => setTone(v as any)} label="Skin">
          <option value="any">Any</option>
          {tonesForGender.map(t => (<option key={t} value={t}>{t}</option>))}
        </Select>

        <Select value={expr} onChange={v => setExpr(v as any)} label="Expression">
          <option value="any">Any</option>
          {exprForSelection.map(e => (<option key={e} value={e}>{EXPR_LABEL[e]}</option>))}
        </Select>
      </section>

      {/* 轮播 */}
      <section className="grow grid place-items-center px-4 py-6">
        <div className="relative w-full max-w-4xl">
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

          <div className="text-center mt-4 text-xl">{cur ? EXPR_LABEL[cur.expr] : "No result"}</div>
        </div>
      </section>

      {/* 底部操作 */}
      <section className="px-4 pb-16 grid place-items-center">
        <button
          onClick={goNext}
          disabled={!cur}
          className="min-w-[180px] rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
        >
          That’s It
        </button>
      </section>

      {/* 右下角返回（与其它页一致） */}
      <button
        onClick={() => nav(-1)}
        className="fixed bottom-5 right-5 z-20 rounded-full border border-white/30 bg-white/10 backdrop-blur px-4 py-2 text-sm hover:bg-white/15"
        aria-label="Back"
      >
        ← Back
      </button>
    </main>
  );
}

/* ========= 小组件 ========= */

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
          // 深色半透明底 + 白字；下拉面板也尽量深色白字（受浏览器限制）
          className="
            appearance-none pl-3 pr-8 py-2 rounded-md
            bg-white/10 text-white border border-white/25 backdrop-blur
            hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/50
            [&>option]:bg-[#151821] [&>option]:text-white
          "
        >
          {children}
        </select>
        {/* 自定义小箭头 */}
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

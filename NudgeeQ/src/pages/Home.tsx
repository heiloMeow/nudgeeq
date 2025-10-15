// src/pages/Home.tsx
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <main
      className="
        relative overflow-hidden text-white min-h-svh flex flex-col
        /* 顶部粉紫光晕 + 底部暗化 */
        bg-[radial-gradient(65%_75%_at_75%_10%,theme(colors.brand.300/.95),rgba(17,14,20,.92))]
      "
    >
      {/* 底部暗紫叠层，增强雾面过渡 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%]
                   bg-[linear-gradient(180deg,transparent,theme(colors.brand.800/.88))]"
      />

      {/* 顶部品牌 */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      {/* 中段装饰泡泡（替换为头像） */}
      <section className="relative grow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[2svh] h-[46svh] mx-auto max-w-[1100px]"
        >
          {/* 右上主泡泡群（都换成 /public/avatars 下的图片） */}
          <Bubble size="w-[240px] h-[240px]" className="absolute right-[14vw] top-[2svh] -translate-y-[6svh]">
            <img
              src="/avatars/white-smile.png"
              alt=""
              className="w-[68%] h-[68%] rounded-full object-contain"
            />
          </Bubble>

          <Bubble size="w-[170px] h-[170px]" className="absolute right-[2vw]  top-[10svh] -translate-y-[4svh] delay-1000">
            <img
              src="/avatars/yellow-okay.png"
              alt=""
              className="w-[70%] h-[70%] rounded-full object-contain"
            />
          </Bubble>

          <Bubble size="w-[150px] h-[150px]" className="absolute right-[10vw] top-[22svh] -translate-y-[5svh] delay-500">
            <img
              src="/avatars/colorful-normal.png"
              alt=""
              className="w-[70%] h-[70%] rounded-full object-contain"
            />
          </Bubble>

          <Bubble size="w-[110px] h-[110px]" className="absolute right-[22vw] top-[18svh] -translate-y-[3svh] delay-2000">
            <img
              src="/avatars/brown-smile.png"
              alt=""
              className="w-[72%] h-[72%] rounded-full object-contain"
            />
          </Bubble>

          {/* 左侧淡装饰（避免过空） */}
          <Bubble size="w-[90px] h-[90px]" className="absolute left-[8vw] top-[8svh] -translate-y-[5svh] opacity-70">
            <img
              src="/avatars/white2-annoying.png"
              alt=""
              className="w-[72%] h-[72%] rounded-full object-contain"
            />
          </Bubble>
        </div>
      </section>

      {/* 底部文案与 CTA */}
      <section className="mt-auto px-[clamp(20px,4vw,40px)] pb-8 relative z-10" aria-labelledby="welcome-title">
        <div className="max-w-[720px]">
          <h1 id="welcome-title" className="font-display text-[clamp(40px,8vw,84px)] leading-[1.05]">
            Welcome
          </h1>
          <p className="opacity-90 text-[clamp(16px,2.5vw,24px)]">Let&apos;s enjoy your library time</p>
          <p className="mt-2 text-[clamp(18px,2.8vw,28px)]">with <strong>NudgeeQ</strong></p>
        </div>

        <div className="h-px my-5 bg-gradient-to-r from-transparent via-white/55 to-transparent" />

        <div className="grid place-items-center gap-2">
          <button
            onClick={() => nav("/role")} /* 路由到创建/选择角色 */
            className="w-[72px] h-[72px] rounded-full border border-white/35 bg-white/12
                       text-4xl leading-none backdrop-blur hover:bg-white/18
                       focus-visible:outline outline-2 outline-white"
            aria-label="Join a table"
          >
            +
          </button>
          <div className="text-lg opacity-95">Join Table</div>
        </div>
      </section>

      <div className="sr-only" aria-live="polite" />
    </main>
  );
}

function Bubble({
  size, className = "", children,
}: { size: string; className?: string; children?: ReactNode }) {
  return (
    <div
      className={[
        "rounded-full grid place-items-center bubble-float",
        "bg-[radial-gradient(80%_80%_at_30%_25%,rgba(255,255,255,.16),rgba(255,255,255,.07))]",
        "shadow-[0_20px_60px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.2)]",
        "backdrop-blur-sm text-[38px]",
        size, className,
      ].join(" ")}
    >
      {children /* 不传时仍会显示默认🙂 */}
    </div>
  );
}

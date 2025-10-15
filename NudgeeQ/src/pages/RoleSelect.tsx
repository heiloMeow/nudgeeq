// src/pages/RoleSelect.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

/**
 * API 约定（可按需修改）：
 *   GET  {API_BASE}/roles           -> RoleSummary[]
 *   // 统一落盘在“最后一步”由其它页面 POST：
 *   // POST {API_BASE}/roles        -> 保存完整创建数据（由最终步骤调用，不在本页）
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type RoleSummary = { id: string; name: string };

export default function RoleSelect() {
  const nav = useNavigate();
  const { setDraftUser, setUser } = useApp();
  const [name, setName] = useState("");
  const canSubmit = useMemo(() => name.trim().length > 0, [name]);

  // 仅创建草稿，不落盘；最终由“最后一步”统一 POST
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setDraftUser({ id: crypto.randomUUID(), name: name.trim() });
    nav("/table"); // 下一步：选桌
  }

  // 选择现有角色：直接成为正式用户；默认进入选桌
  function useExisting(role: RoleSummary) {
    setDraftUser(undefined);
    setUser({ id: role.id, name: role.name });
    nav("/table"); // 若想直接进房，改成 nav("/room")
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(65%_75%_at_75%_10%,theme(colors.brand.300/.95),rgba(17,14,20,.92))]
      "
    >
      {/* 顶部品牌 */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      {/* 居中“登录式”卡片 */}
      <section className="grow grid place-items-center px-4">
        <div
          className="
            w-full max-w-md rounded-2xl border border-white/15 bg-white/8 backdrop-blur-md
            p-6 shadow-[0_10px_40px_rgba(0,0,0,.35)]
          "
        >
          <h1 className="font-display text-3xl mb-3">Create your role</h1>

          <form onSubmit={submit} className="grid gap-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Create your role"
              className="
                w-full rounded-lg bg-black/20 border border-white/20 px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-white/50
              "
              aria-label="Create your role"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="
                mt-2 w-full rounded-lg py-2
                bg-brand-500 hover:bg-brand-700 disabled:opacity-50
              "
            >
              Continue
            </button>
          </form>

          <div className="my-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* 打开“现有角色”弹窗 */}
          <ExistingRolesButton onPick={useExisting} />
        </div>
      </section>

      {/* 右下角返回上一页（统一 Router 返回） */}
      <button
        onClick={() => nav(-1)}
        className="
          fixed bottom-5 right-5 z-20 rounded-full
          border border-white/30 bg-white/10 backdrop-blur
          px-4 py-2 text-sm hover:bg-white/15
        "
        aria-label="Back to previous page"
      >
        ← Back
      </button>
    </main>
  );
}

/* ============ 子组件：现有角色弹窗（从后端 JSON 拉取） ============ */

function ExistingRolesButton({ onPick }: { onPick: (r: RoleSummary) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="
          w-full rounded-lg py-2 border border-white/25 bg-white/10
          hover:bg-white/15
        "
      >
        Or choose an existing role
      </button>
      {open && <RolePicker onClose={() => setOpen(false)} onPick={onPick} />}
    </>
  );
}

function RolePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (r: RoleSummary) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // 打开时获取后端角色列表（只需用户名/ID）
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(`${API_BASE}/roles`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RoleSummary[] | { items: RoleSummary[] };
        const items = Array.isArray(data) ? data : (data as any).items ?? [];
        if (alive) setList(items);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Failed to fetch");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 关闭：Esc & 点击遮罩
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onOverlay(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onMouseDown={onOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-picker-title"
    >
      <div
        ref={dialogRef}
        className="
          w-full max-w-lg rounded-2xl border border-white/20 bg-white/10
          backdrop-blur-md p-5 shadow-[0_10px_40px_rgba(0,0,0,.45)]
        "
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="role-picker-title" className="font-display text-2xl">
            Choose an existing role
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 border border-white/25 bg-white/10 hover:bg-white/15"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="opacity-85">Loading…</div>
        ) : err ? (
          <div className="text-red-200">Error: {err}</div>
        ) : list.length === 0 ? (
          <div className="opacity-85">No roles yet.</div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onPick(r)}
                  className="
                    w-full text-left rounded-xl px-3 py-2
                    border border-white/20 bg-white/10 hover:bg-white/15
                  "
                  aria-label={`Use ${r.name}`}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

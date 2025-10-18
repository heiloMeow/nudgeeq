// src/pages/RoleSelect.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

/**
 * API:
 *   GET  {API}/roles?search=xx   -> RoleSummary[]
 *   POST {API}/roles             -> only used by Finalize, not here
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

type RoleSummary = { id: string; name: string };

export default function RoleSelect() {
  const nav = useNavigate();
  const { setDraftUser, setUser } = useApp();
  const [name, setName] = useState("");
  const canSubmit = useMemo(() => name.trim().length > 0, [name]);

  // Create draft only; Finalize will POST /roles
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setDraftUser({ id: crypto.randomUUID(), name: name.trim() });
    nav("/table"); // go to table picker (new role flow)
  }

  // Pick existing role: become the user immediately and jump to NearbyTables
  async function useExisting(role: RoleSummary) {
    setDraftUser(undefined);
    setUser({ id: role.id, name: role.name });

    // try to fetch tableId for highlighting in Nearby
    let tableId: string | undefined;
    try {
      const res = await fetch(`${API}/roles/${encodeURIComponent(role.id)}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const info = await res.json();
        if (info?.tableId) tableId = String(info.tableId);
      }
    } catch {
      // ignore; still navigate
    }

    // jump straight to NearbyTables (skip seat & finalize)
    nav("/nearby", { replace: true, state: tableId ? { tableId } : undefined });
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(65%_75%_at_75%_10%,theme(colors.brand.300/.95),rgba(17,14,20,.92))]
      "
    >
      {/* Brand */}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      {/* Card */}
      <section className="grow grid place-items-center px-4">
        <div
          className="
            w-full max-w-md rounded-2xl border border-white/15 bg-white/8 backdrop-blur-md
            p-6 shadow-[0_10px_40px_rgba(0,0,0,.35)]
          "
        >
          <h1 className="font-display text-3xl mb-3">Enter your nickname</h1>

          <form onSubmit={submit} className="grid gap-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your nickname"
              className="
                w-full rounded-lg bg-black/20 border border-white/20 px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-white/50
              "
              aria-label="Enter your nickname"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 w-full rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
            >
              Continue
            </button>
          </form>

          <div className="my-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* Existing roles */}
          <ExistingRolesButton onPick={useExisting} />
        </div>
      </section>

      {/* Back */}
      <button
        onClick={() => nav(-1)}
        className="fixed bottom-5 right-5 z-20 rounded-full border border-white/30 bg-white/10 backdrop-blur px-4 py-2 text-sm hover:bg-white/15"
        aria-label="Back to previous page"
      >
        ← Back
      </button>
    </main>
  );
}

/* ============ Existing roles modal (server-side search) ============ */

function ExistingRolesButton({ onPick }: { onPick: (r: RoleSummary) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg py-2 border border-white/25 bg-white/10 hover:bg-white/15"
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
  const [q, setQ] = useState("");
  const [list, setList] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Debounced search
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        setErr("");
        const url =
          q.trim().length > 0
            ? `${API}/roles?search=${encodeURIComponent(q.trim())}`
            : `${API}/roles`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RoleSummary[] | { items: RoleSummary[] };
        const items = Array.isArray(data) ? data : (data as any).items ?? [];
        if (alive) setList(items.slice(0, 20));
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Failed to fetch");
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  // Esc to close
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

        {/* Search */}
        <div className="mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg bg-black/25 border border-white/25 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Search roles"
          />
        </div>

        {loading ? (
          <div className="opacity-85">Loading…</div>
        ) : err ? (
          <div className="text-red-200">Error: {err}</div>
        ) : list.length === 0 ? (
          <div className="opacity-85">No roles found.</div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2 max-h-[50vh] overflow-auto pr-1">
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

// src/pages/UserRoleSelect.tsx
import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";
import { fetchMyRoleDetail } from "./userFlowApi";
import type { UserEditState } from "./userFlowTypes";

export default function UserRoleSelect() {
  const nav = useNavigate();
  const { user, draftUser, setDraftUser: storeSetDraftUser } = useApp();
  const { state } = useLocation() as { state?: UserEditState };
  const hasBaseState = Boolean(state?.tableId && state?.seatId);
  const stateName = state?.name;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [base, setBase] = useState<UserEditState>({
    tableId: state?.tableId,
    seatId: state?.seatId,
    avatarSrc: state?.avatarSrc,
    signals: [],
  });
  const [name, setName] = useState("");

  useEffect(() => {
    if (!user && !draftUser) {
      nav("/", { replace: true });
      return;
    }
    if (hasBaseState || !user?.id) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const info = await fetchMyRoleDetail(user.id);
        if (!active) return;
        const nextBase: UserEditState = {
          tableId: info.tableId,
          seatId: info.seatId,
          avatarSrc: info.avatar,
          signals: [],
        };
        setBase((prev) => ({ ...prev, ...nextBase }));
      } catch (e: unknown) {
        if (!active) return;
        const message = e instanceof Error ? e.message : "Failed to load profile.";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, draftUser, nav, hasBaseState, stateName]);

  const canContinue = useMemo(() => name.trim().length > 0, [name]);

  const startStatus = (e: FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    const trimmedName = name.trim();
    const payload: UserEditState = {
      ...base,
      name: trimmedName,
      tableId: base.tableId,
      seatId: base.seatId,
    };
    if (!payload.tableId || !payload.seatId) {
      setError("Unable to load your table or seat. Please try again.");
      return;
    }
    storeSetDraftUser?.({
      id: draftUser?.id ?? user?.id ?? crypto.randomUUID(),
      name: trimmedName,
      avatar: draftUser?.avatar ?? user?.avatar,
    });
    nav("/user/status", { state: { ...payload, name: trimmedName } });
  };

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(65%_75%_at_75%_10%,theme(colors.brand.300/.95),rgba(17,14,20,.92))]
      "
    >
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>
      </header>

      <section className="grow grid place-items-center px-4">
        <div
          className="
            w-full max-w-md rounded-2xl border border-white/15 bg-white/8 backdrop-blur-md
            p-6 shadow-[0_10px_40px_rgba(0,0,0,.35)]
          "
        >
          <h1 className="font-display text-3xl mb-3">Enter your nickname</h1>

          <form onSubmit={startStatus} className="grid gap-3">
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
              disabled={!canContinue || loading}
              className="mt-2 w-full rounded-lg py-2 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
            >
              Continue
            </button>
          </form>

          <div className="my-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {loading && <div className="mt-3 text-sm opacity-80">Loading current role…</div>}
          {error && <div className="mt-3 text-sm text-red-200">{error}</div>}
        </div>
      </section>

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

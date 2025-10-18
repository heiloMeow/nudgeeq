// src/pages/NearbyTables.tsx
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../app/store";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

type Occupant = {
  id: string;
  name: string;
  avatar: string;    // "/avatars/xxx.png" or full URL
  signals: string[]; // e.g. ["cable", "study buddy"]
};

type TableData = {
  id: number | string;
  seats: (Occupant | null)[];
};

type MyRoleDetail = {
  id: string;
  name: string;
  avatar: string;
  tableId?: string;
  seatId?: number;
  signals?: string[];
  createdAt?: string;
};

export default function NearbyTables() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { tableId?: string | number } };
  const app = useApp();
  const { user, setUser, setDraftUser } = app;
  const { tableId: fromStore } = app.room ?? ({} as any);

  // Current table id: prefer route state, then global store, fallback to "1"
  const currentTableId = String(state?.tableId ?? fromStore ?? "1");
  const myId = user?.id ?? "";

  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<TableData[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Highlighted hits: role ids returned from /search/signals
  const [hitIds, setHitIds] = useState<Set<string>>(new Set());

  // Header avatar (eager)
  const [myAvatar, setMyAvatar] = useState<string>("/avatars/white-smile.png");

  // Profile modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [meDetail, setMeDetail] = useState<MyRoleDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState("");

  // Sign-out confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");

  async function fetchNearbyTables() {
    try {
      setError("");
      setLoading(true);
      const url = `${API}/tables?near=${encodeURIComponent(currentTableId)}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TableData[] = await res.json();

      // ★ 升序显示桌号（优先数值排序，回退自然排序）
      data.sort((a, b) => {
        const an = Number(a.id), bn = Number(b.id);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });

      setTables(normalizeTables(data));
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNearbyTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTableId]);

  // Eagerly fetch my avatar for the header button
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!myId) {
        setMyAvatar("/avatars/white-smile.png");
        return;
      }
      try {
        const res = await fetch(`${API}/roles/${encodeURIComponent(myId)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!stop) setMyAvatar(ensureAvatar(String(j.avatar ?? "")));
      } catch {
        if (!stop) setMyAvatar("/avatars/white-smile.png");
      }
    })();
    return () => { stop = true; };
  }, [myId]);

  // Search & highlight
  useEffect(() => {
    let stopped = false;
    const t = setTimeout(async () => {
      const q = query.trim();
      if (!q) {
        if (!stopped) setHitIds(new Set());
        return;
      }
      try {
        const res = await fetch(`${API}/search/signals?q=${encodeURIComponent(q)}&limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows: Array<any> = await res.json();

        const ids = new Set<string>();
        for (const r of rows) {
          const id =
            (typeof r.role === "object" && r.role?.id) ||
            (typeof r.role === "string" && r.role) ||
            r.roleId ||
            r.id;
          if (id) ids.add(String(id));
        }
        if (!stopped) setHitIds(ids);
      } catch {
        if (!stopped) setHitIds(new Set());
      }
    }, 250);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [query]);

  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const onContact = (u: Occupant) => {
    nav("/contact", { state: { tableId: currentTableId, peerId: u.id, peerName: u.name } });
  };

  /* ---------------- profile modal actions ---------------- */

  function openProfile() {
    if (!myId) {
      nav("/role");
      return;
    }
    setProfileOpen(true);
    // Lazy load full detail
    (async () => {
      try {
        setProfileLoading(true);
        setProfileErr("");
        const res = await fetch(`${API}/roles/${encodeURIComponent(myId)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as MyRoleDetail;
        setMeDetail({
          id: j.id,
          name: j.name,
          avatar: ensureAvatar(j.avatar),
          tableId: j.tableId ? String(j.tableId) : undefined,
          seatId: typeof j.seatId === "number" ? j.seatId : Number(j.seatId ?? 0) || undefined,
          signals: Array.isArray(j.signals) ? j.signals : [],
          createdAt: j.createdAt,
        });
      } catch (e: any) {
        setProfileErr(e?.message ?? "Failed to load profile");
      } finally {
        setProfileLoading(false);
      }
    })();
  }

  async function actionRename(newName: string) {
    if (!myId) return;
    const current = meDetail?.name ?? user?.name ?? "";
    const name = newName.trim();
    if (!name || name === current) return;

    try {
      const res = await fetch(`${API}/roles/${encodeURIComponent(myId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const r = j?.error ? ` - ${j.error}` : "";
        throw new Error(`HTTP ${res.status}${r}`);
      }
      // update local
      setUser({ id: myId, name });
      setMeDetail((d) => (d ? { ...d, name } : d));
    } catch (e: any) {
      setProfileErr(e?.message ?? "Rename failed");
    }
  }

  function actionChangeTable() {
    setProfileOpen(false);
    nav("/table");
  }

  // open confirm dialog instead of alert/confirm
  function requestSignOut() {
    setConfirmErr("");
    setConfirmOpen(true);
  }

  async function actuallySignOut() {
    if (!myId) return;
    try {
      setConfirmBusy(true);
      setConfirmErr("");
      const res = await fetch(`${API}/roles/${encodeURIComponent(myId)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const r = j?.error ? ` - ${j.error}` : "";
        throw new Error(`HTTP ${res.status}${r}`);
      }
    } catch (e: any) {
      setConfirmErr(e?.message ?? "Server error while signing out.");
      return; // 不关闭弹窗，给用户可重试
    } finally {
      setConfirmBusy(false);
    }
    // 清空本地并跳转
    try { setUser(undefined as any); } catch {}
    try { setDraftUser?.(undefined); } catch {}
    setProfileOpen(false);
    setConfirmOpen(false);
    nav("/role", { replace: true });
  }

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* Background texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.10]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      {/* Header */}
      <header className="px-7 pt-6 pb-2 flex items-center gap-3">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ</span>

        {/* Avatar button (eager avatar) */}
        <button
          onClick={openProfile}
          className="
            ml-2 rounded-full border border-white/30 bg-white/10 backdrop-blur
            size-[40px] p-0 grid place-items-center overflow-hidden
            hover:bg-white/15 hover:shadow-[0_0_0_3px_rgba(255,255,255,.25),0_0_26px_rgba(255,255,255,.35)]
            transition
          "
          aria-label="Open my profile"
          title="My profile"
        >
          <img
            src={myAvatar}
            onError={(e) => { e.currentTarget.src = "/avatars/white-smile.png"; }}
            alt="Me"
            className="w-[82%] h-[82%] object-contain"
          />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search signal (e.g. cable)"
              className="w-[280px] rounded-xl pl-3 pr-9 py-2 bg-white/10 text-white border border-white/25 backdrop-blur
                         placeholder:text-white/60 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-80">🔍</span>
          </div>
          <button
            onClick={fetchNearbyTables}
            className="rounded-md border border-white/25 bg-white/10 hover:bg-white/15 px-3 py-1.5"
            aria-label="Refresh"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Title + hint */}
      <section className="px-4 mb-2">
        <h1 className="text-center font-display text-[clamp(26px,4.6vw,40px)]">Nearby Tables</h1>
        <p className="text-center text-white/85 mt-1">
          Type a keyword to highlight users with that signal. Click an avatar to contact.
        </p>
        <p className="text-center text-white/70 mt-1 text-sm">
          Current table: <span className="font-semibold">#{currentTableId}</span>
        </p>
      </section>

      {/* Data states */}
      {error && <div className="px-6 text-center text-red-200">Failed to load: {error}</div>}
      {loading && !error && <div className="px-6 text-center text-white/80">Loading nearby tables…</div>}

      {/* List */}
      <section className="grow px-6 pb-10 grid gap-10 place-items-center">
        {tables?.map((t) => (
          <TableCard
            key={String(t.id)}
            tableId={String(t.id)}
            seats={t.seats}
            hitIds={hitIds}
            activeUserId={activeUserId}
            setActiveUserId={setActiveUserId}
            onContact={onContact}
            myId={myId}
          />
        ))}
        {tables && tables.length === 0 && (
          <div className="text-white/80">No nearby tables found.</div>
        )}
      </section>

      {/* Profile Modal */}
      {profileOpen && (
        <ProfileModal
          onClose={() => setProfileOpen(false)}
          loading={profileLoading}
          error={profileErr}
          detail={meDetail}
          onRename={actionRename}
          onChangeTable={actionChangeTable}
          onSignOut={requestSignOut}
        />
      )}

      {/* Sign-out Confirm Modal */}
      {confirmOpen && (
        <ConfirmDialog
          title="Sign out?"
          desc="You will free your seat and remove this role. This cannot be undone."
          confirmText="Sign out"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={actuallySignOut}
          busy={confirmBusy}
          error={confirmErr}
        />
      )}
    </main>
  );
}

/* ---------------- helpers ---------------- */
function normalizeTables(list: TableData[]): TableData[] {
  return list.map((t) => {
    const seats = [...(t.seats ?? [])].slice(0, 6);
    while (seats.length < 6) seats.push(null);
    const fixed = seats.map((u) =>
      u
        ? {
            ...u,
            avatar: ensureAvatar(u.avatar),
            signals: Array.isArray(u.signals) ? u.signals : [],
          }
        : null
    );
    return { id: t.id, seats: fixed };
  });
}

function ensureAvatar(s: string): string {
  const v = (s ?? "").trim();
  if (!v) return "/avatars/white-smile.png";
  return v.startsWith("/") || v.startsWith("http") ? v : `/avatars/${v}`;
}

/* ---------------- components ---------------- */

function TableCard({
  tableId,
  seats,
  hitIds,
  activeUserId,
  setActiveUserId,
  onContact,
  myId,
}: {
  tableId: string;
  seats: (Occupant | null)[];
  hitIds: Set<string>;
  activeUserId: string | null;
  setActiveUserId: (id: string | null) => void;
  onContact: (u: Occupant) => void;
  myId: string;
}) {
  const left = seats.slice(0, 3);
  const right = seats.slice(3, 6);

  return (
    <div
      className="
        w-full max-w-5xl rounded-[24px] p-8 md:p-10
        border border-white/14 bg-white/10 backdrop-blur-xl
        shadow-[0_25px_80px_rgba(0,0,0,.45)] relative
      "
    >
      <div className="relative mx-auto w-full max-w-4xl h-[200px] md:h-[220px]">
        {/* Left column － 提高层级避免桌边框穿透 */}
        <div className="absolute -left-[64px] top-6 bottom-6 flex flex-col items-center justify-between gap-3 z-30">
          {left.map((occ, i) => (
            <SeatAvatar
              key={`L${i}`}
              occ={occ}
              isSelf={!!occ && occ.id === myId}
              active={!!occ && occ?.id === activeUserId}
              highlighted={!!(occ && hitIds.has(occ.id))}
              onToggle={() => setActiveUserId(occ ? (activeUserId === occ.id ? null : occ.id) : null)}
              onContact={onContact}
              side="left"
            />
          ))}
        </div>

        {/* Table top － 用 inset 阴影模拟描边，避免“直线”伪影 */}
        <div className="h-full relative overflow-visible z-10 isolate">
          <div className="absolute inset-0 rounded-[20px] bg-white/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,.2)]" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="font-display text-[52px] md:text-[64px] text-white/12 select-none">#{tableId}</span>
          </div>
        </div>

        {/* Right column － 提高层级避免桌边框穿透 */}
        <div className="absolute -right-[64px] top-6 bottom-6 flex flex-col items-center justify-between gap-3 z-30">
          {right.map((occ, i) => (
            <SeatAvatar
              key={`R${i}`}
              occ={occ}
              isSelf={!!occ && occ.id === myId}
              active={!!occ && occ?.id === activeUserId}
              highlighted={!!(occ && hitIds.has(occ.id))}
              onToggle={() => setActiveUserId(occ ? (activeUserId === occ.id ? null : occ.id) : null)}
              onContact={onContact}
              side="right"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SeatAvatar({
  occ,
  isSelf,
  highlighted,
  active,
  onToggle,
  onContact,
  side,
}: {
  occ: Occupant | null;
  isSelf: boolean;
  highlighted: boolean;
  active: boolean;
  onToggle: () => void;
  onContact: (u: Occupant) => void;
  side: "left" | "right";
}) {
  if (!occ) {
    return (
      <div className="size-[72px] rounded-full border border-white/25 bg-white/10 backdrop-blur-sm" />
    );
  }

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; alignRight: boolean } | null>(null);

  // 激活时计算锚点；窗口滚动/缩放时重新计算
  useLayoutEffect(() => {
    function calc() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({
        top: Math.round(r.bottom + 8),                  // 按钮底部下方 8px
        left: side === "left" ? Math.round(r.left) : Math.round(r.right),
        alignRight: side === "right",                   // 右侧对齐用 translateX(-100%)
      });
    }
    if (active) {
      calc();
      window.addEventListener("scroll", calc, true);
      window.addEventListener("resize", calc);
      return () => {
        window.removeEventListener("scroll", calc, true);
        window.removeEventListener("resize", calc);
      };
    }
  }, [active, side]);

  const base =
    "relative size-[72px] md:size-[78px] rounded-full grid place-items-center overflow-hidden border backdrop-blur-sm transition transform-gpu";
  const normal = "border-white/35 bg-white/15 shadow-[0_8px_20px_rgba(0,0,0,.35)]";
  const hitGlow =
    "ring-8 ring-brand-400 scale-[1.15] shadow-[0_0_30px_rgba(255,255,255,.45),0_0_70px_rgba(163,136,255,.55)] animate-[pulse_1.8s_ease-in-out_infinite]";
  const activeGlow =
    "ring-8 ring-white/80 scale-[1.12] shadow-[0_0_26px_rgba(255,255,255,.55),0_0_80px_rgba(255,255,255,.35)]";
  const selfGlow =
    "ring-4 ring-emerald-400/95 shadow-[0_0_28px_rgba(16,185,129,.45),0_0_60px_rgba(16,185,129,.25)]";

  const classes = [base, normal];
  if (isSelf) {
    classes.push(selfGlow);
  } else {
    if (highlighted) classes.push(hitGlow);
    if (active) classes.push(activeGlow);
  }

  return (
    <div className="relative z-40">
      <button
        ref={btnRef}
        onClick={onToggle}
        className={classes.join(" ")}
        title={occ.name + (isSelf ? " (You)" : "")}
        aria-label={occ.name + (isSelf ? " (You)" : "")}
      >
        <img src={occ.avatar} alt={occ.name} className="w-[86%] h-[86%] object-contain" />
      </button>

      {/* “You” 徽标：放外层，不被头像裁剪 */}
      {isSelf && (
        <span
          className="
            pointer-events-none select-none
            absolute -right-2 -bottom-2 translate-x-[20%] translate-y-[20%]
            z-50 text-[10px] px-2 py-[2px] rounded-full
            bg-emerald-400 text-black font-semibold
            shadow-[0_2px_10px_rgba(0,0,0,.35)]
          "
        >
          You
        </span>
      )}

      {/* Contact 操作：使用 Portal 渲染到 body，固定定位到按钮旁边，保证最高层 */}
      {active && anchor &&
        createPortal(
          <div
            className="fixed z-[4000]" // 高于一切卡片
            style={{
              top: anchor.top,
              left: anchor.left,
              transform: anchor.alignRight ? "translateX(-100%)" : "none",
            }}
          >
            <div className="rounded-xl border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.55)]">
              <button onClick={() => onContact(occ)} className="text-sm hover:underline">
                Contact
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}


/* ---------------- Profile Modal ---------------- */

function ProfileModal({
  onClose,
  loading,
  error,
  detail,
  onRename,
  onChangeTable,
  onSignOut,
}: {
  onClose: () => void;
  loading: boolean;
  error: string;
  detail: MyRoleDetail | null;
  onRename: (newName: string) => void | Promise<void>;
  onChangeTable: () => void;
  onSignOut: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(detail?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    setNameInput(detail?.name ?? "");
  }, [detail?.name]);

  async function saveName() {
    const v = (nameInput ?? "").trim();
    if (!v || v === detail?.name) {
      setIsEditing(false);
      return;
    }
    try {
      setSaving(true);
      setLocalErr("");
      await onRename(v);
      setIsEditing(false);
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to rename");
    } finally {
      setSaving(false);
    }
  }

  function onOverlay(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onMouseDown={onOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <div
        className="
          w-full max-w-lg rounded-2xl border border-white/20 bg-white/10
          backdrop-blur-md p-5 shadow-[0_10px_40px_rgba(0,0,0,.45)]
        "
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="profile-title" className="font-display text-2xl">My profile</h2>
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
        ) : error ? (
          <div className="text-red-200">Error: {error}</div>
        ) : detail ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <div
                className="
                  size-[84px] rounded-full grid place-items-center overflow-hidden
                  border border-white/30 bg-white/15 shadow-[0_10px_30px_rgba(0,0,0,.35)]
                "
              >
                <img src={detail.avatar} alt={detail.name} className="w-[86%] h-[86%] object-contain" />
              </div>
              <div className="flex-1">
                {!isEditing ? (
                  <>
                    <div className="text-xl font-semibold">{detail.name}</div>
                    <div className="opacity-85 mt-1">
                      {detail.tableId ? `Table ${detail.tableId}` : "—"}
                      {detail.seatId ? ` · Seat ${detail.seatId}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="flex-1 rounded-lg bg-black/20 border border-white/25 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/40"
                      placeholder="Enter a new name"
                    />
                    <button
                      onClick={saveName}
                      disabled={saving || !nameInput.trim()}
                      className="rounded-md px-3 py-1.5 bg-brand-500 hover:bg-brand-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setIsEditing(false); setNameInput(detail.name); }}
                      disabled={saving}
                      className="rounded-md px-3 py-1.5 border border-white/25 bg-white/10 hover:bg-white/15"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {localErr && <div className="text-red-200 text-sm mt-1">{localErr}</div>}
              </div>
            </div>

            {detail.signals && detail.signals.length > 0 && (
              <div className="space-y-2">
                {detail.signals.map((t, i) => (
                  <span
                    key={i}
                    className="inline-block mr-2 rounded-xl px-3 py-1 border border-white/25 bg-white/10"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="grid gap-2 mt-2">
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg py-2 border border-white/25 bg-white/10 hover:bg-white/15"
                >
                  Edit name
                </button>
              )}
              <button
                onClick={onChangeTable}
                className="rounded-lg py-2 border border-white/25 bg-white/10 hover:bg-white/15"
              >
                Change information
              </button>
              <button
                onClick={onSignOut}
                className="rounded-lg py-2 border border-red-300/50 bg-red-300/10 hover:bg-red-300/20 text-red-100"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="opacity-85">No profile loaded.</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Confirm Dialog (no alert/confirm) ---------------- */

function ConfirmDialog({
  title,
  desc,
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  title: string;
  desc?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  function onOverlay(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      onMouseDown={onOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-5 shadow-[0_10px_40px_rgba(0,0,0,.55)]">
        <h3 id="confirm-title" className="font-display text-2xl mb-2">{title}</h3>
        {desc && <p className="text-white/85 mb-3">{desc}</p>}
        {error && <div className="mb-2 text-red-200 text-sm">Error: {error}</div>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={!!busy}
            className="rounded-lg px-4 py-2 border border-white/25 bg-white/10 hover:bg-white/15 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={!!busy}
            className="rounded-lg px-4 py-2 bg-red-500/90 hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? "Processing…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

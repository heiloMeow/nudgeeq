// src/pages/NearbyTables.tsx
import { useEffect, useState } from "react";
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

export default function NearbyTables() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { tableId?: string | number } };
  const { tableId: fromStore } = useApp().room ?? ({} as any);

  // Current table id: prefer route state, then global store, fallback to "1"
  const currentTableId = String(state?.tableId ?? fromStore ?? "1");

  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<TableData[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Highlighted hits: role ids returned from /search/signals
  const [hitIds, setHitIds] = useState<Set<string>>(new Set());

  async function fetchNearbyTables() {
    try {
      setError("");
      setLoading(true);
      const url = `${API}/tables?near=${encodeURIComponent(currentTableId)}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TableData[] = await res.json();
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

  // Search & highlight: call /search/signals?q=xxx and collect role ids
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

        // Be liberal in what we accept:
        //  - { roleId: "..." }
        //  - { role: { id: "..." } }
        //  - { role: "..." }
        //  - { id: "..." }
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
    }, 250); // debounce
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [query]);

  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const onContact = (u: Occupant) => {
    nav("/contact", { state: { tableId: currentTableId, peerId: u.id, peerName: u.name } });
  };

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
        <button
          onClick={() => nav(-1)}
          className="ml-2 rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/15"
          aria-label="Back"
        >
          ←
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
          />
        ))}
        {tables && tables.length === 0 && (
          <div className="text-white/80">No nearby tables found.</div>
        )}
      </section>
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
  if (!s) return "/avatars/white-smile.png";
  return s.startsWith("/") || s.startsWith("http") ? s : `/avatars/${s}`;
}

/* ---------------- components ---------------- */

function TableCard({
  tableId,
  seats,
  hitIds,
  activeUserId,
  setActiveUserId,
  onContact,
}: {
  tableId: string;
  seats: (Occupant | null)[];
  hitIds: Set<string>;
  activeUserId: string | null;
  setActiveUserId: (id: string | null) => void;
  onContact: (u: Occupant) => void;
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
        {/* Left column */}
        <div className="absolute -left-[56px] top-6 bottom-6 flex flex-col items-center justify-between gap-3">
          {left.map((occ, i) => (
            <SeatAvatar
              key={`L${i}`}
              occ={occ}
              active={!!occ && occ?.id === activeUserId}
              highlighted={!!(occ && hitIds.has(occ.id))}
              onToggle={() => setActiveUserId(occ ? (activeUserId === occ.id ? null : occ.id) : null)}
              onContact={onContact}
              side="left"
            />
          ))}
        </div>

        {/* Table top */}
        <div className="h-full rounded-[20px] bg-white/8 border border-white/20 relative overflow-visible">
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="font-display text-[52px] md:text-[64px] text-white/12 select-none">#{tableId}</span>
          </div>
        </div>

        {/* Right column */}
        <div className="absolute -right-[56px] top-6 bottom-6 flex flex-col items-center justify-between gap-3">
          {right.map((occ, i) => (
            <SeatAvatar
              key={`R${i}`}
              occ={occ}
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
  highlighted,
  active,
  onToggle,
  onContact,
  side,
}: {
  occ: Occupant | null;
  highlighted: boolean;
  active: boolean;
  onToggle: () => void;
  onContact: (u: Occupant) => void;
  side: "left" | "right";
}) {
  if (!occ) {
    return (
      <div className="size-[64px] rounded-full border border-white/25 bg-white/10 backdrop-blur-sm" />
    );
  }

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={[
          "size-[64px] md:size-[70px] rounded-full grid place-items-center overflow-hidden",
          "border border-white/35 bg-white/15 backdrop-blur-sm shadow-[0_8px_20px_rgba(0,0,0,.35)]",
          "transition",
          highlighted ? "ring-4 ring-brand-500 scale-[1.06]" : "",
        ].join(" ")}
        title={occ.name}
        aria-label={occ.name}
      >
        <img src={occ.avatar} alt={occ.name} className="w-[86%] h-[86%] object-contain" />
      </button>

      {active && (
        <div className={["absolute z-20 mt-2", side === "left" ? "left-0" : "right-0"].join(" ")}>
          <div className="rounded-xl border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,.35)]">
            <button onClick={() => onContact(occ)} className="text-sm hover:underline">
              Contact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

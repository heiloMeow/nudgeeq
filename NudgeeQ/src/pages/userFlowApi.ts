const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;

export async function fetchMyRoleDetail(userId: string) {
  const res = await fetch(`${API}/roles/${encodeURIComponent(userId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const info = await res.json();
  const rawSignals: unknown[] = Array.isArray(info?.signals) ? info.signals : [];
  return {
    id: String(info?.id ?? userId),
    name: info?.name ? String(info.name) : "",
    tableId: info?.tableId ? String(info.tableId) : undefined,
    seatId: info?.seatId ? String(info.seatId) : undefined,
    avatar: ensureAvatar(info?.avatar),
    signals: rawSignals.map((s) => String(s ?? "")),
  };
}

export function ensureAvatar(v: unknown) {
  const s = (typeof v === "string" ? v : "")?.trim?.() ?? "";
  if (!s) return "/avatars/white-smile.png";
  if (s.startsWith("/") || s.startsWith("http")) return s;
  return `/avatars/${s}`;
}

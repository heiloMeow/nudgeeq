import express from "express";
import { nanoid } from "nanoid";
import { getTables, getRoles, findTable, createRole, deleteRole, patchSignals } from "./store.js";
import type { Role } from "./types.js";

export const api = express.Router();

/** 健康检查 */
api.get("/health", (_req, res) => res.json({ ok: true }));

/** 查附近桌子：GET /tables?near=24&limit=5 */
api.get("/tables", async (req, res) => {
  const near = String(req.query.near ?? "");
  const limit = Math.max(1, Math.min(20, Number(req.query.limit ?? 5)));
  const tables = await getTables();
  const roles = await getRoles();

  const sorted = near
    ? [...tables].sort(
        (a, b) => Math.abs(Number(a.id) - Number(near)) - Math.abs(Number(b.id) - Number(near))
      )
    : tables;

  const pick = sorted.slice(0, limit);

  // 把 seats 的 roleId 解引用成 { id,name,avatar,signals }
  const out = pick.map(t => ({
    id: t.id,
    seats: t.seats.map((rid) => {
      if (!rid) return null;
      const r = roles.find(rr => rr.id === rid);
      return r
        ? { id: r.id, name: r.name, avatar: r.avatar, signals: r.signals }
        : null;
    })
  }));

  res.json(out);
});

/** 查角色名列表（用于 existing role 选择）：GET /roles?search=xx */
api.get("/roles", async (req, res) => {
  const q = String(req.query.search ?? "").toLowerCase();
  const roles = await getRoles();
  const list = roles
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .slice(0, 20)
    .map(r => ({ id: r.id, name: r.name }));
  res.json(list);
});

/** 创建最终角色（Finalize 的 Seek Help） */
api.post("/roles", express.json(), async (req, res) => {
  try {
    const body = req.body as Partial<Role>;
    if (!body?.name || !body?.tableId || !body?.seatId || !body?.avatar) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    const r: Role = {
      id: body.id ?? nanoid(8),
      name: String(body.name),
      avatar: String(body.avatar),
      signals: Array.isArray(body.signals) ? body.signals.map(String) : [],
      tableId: String(body.tableId),
      seatId: Number(body.seatId),
      createdAt: new Date().toISOString()
    };

    // 座位校验 & 落库
    await createRole(r);
    res.status(201).json({ id: r.id });
  } catch (e: any) {
    if (e?.message === "TABLE_NOT_FOUND") return res.status(404).json({ error: e.message });
    if (e?.message === "SEAT_TAKEN") return res.status(409).json({ error: e.message });
    if (e?.message === "SEAT_OUT_OF_RANGE") return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "INTERNAL" });
  }
});

/** 删除角色（释放座位） */
api.delete("/roles/:id", async (req, res) => {
  await deleteRole(req.params.id);
  res.json({ ok: true });
});

/** 更新 signals */
api.patch("/roles/:id/signals", express.json(), async (req, res) => {
  try {
    const signals = Array.isArray(req.body?.signals) ? req.body.signals.map(String) : [];
    await patchSignals(req.params.id, signals);
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "ROLE_NOT_FOUND") return res.status(404).json({ error: e.message });
    res.status(500).json({ error: "INTERNAL" });
  }
});
// === 查询单个桌子的座位占用（用于 Step 2 选座） ===
// GET /api/tables/:id
api.get("/tables/:id", async (req, res) => {
  const id = String(req.params.id);
  const t = await findTable(id);
  if (!t) return res.status(404).json({ error: "TABLE_NOT_FOUND" });

  const roles = await getRoles();
  const seats = t.seats.map((rid) => {
    if (!rid) return null;
    const r = roles.find(rr => rr.id === rid);
    return r ? { id: r.id, name: r.name, avatar: r.avatar, signals: r.signals } : null;
  });

  res.json({ id, seats }); // seats 长度恒为 6（null=空位）
});

// === 仅看座位是否被占（轻量版，可用于实时刷新） ===
// GET /api/tables/:id/availability
api.get("/tables/:id/availability", async (req, res) => {
  const id = String(req.params.id);
  const t = await findTable(id);
  if (!t) return res.status(404).json({ error: "TABLE_NOT_FOUND" });
  res.json({ id, taken: t.seats.map(Boolean) }); // e.g. [true,false,...]
});
// ===== 角色：获取单个 =====
// GET /api/roles/:id
api.get("/roles/:id", async (req, res) => {
  const role = await (await getRoles()).find(r => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: "ROLE_NOT_FOUND" });
  res.json(role);
});

// ===== 角色：通用编辑（可改 name/avatar/signals，或换桌换座） =====
// PATCH /api/roles/:id
// body: { name?, avatar?, signals?, tableId?, seatId? }
api.patch("/roles/:id", express.json(), async (req, res) => {
  try {
    const updates = req.body ?? {};
    // 只允许这几项
    const allow = ["name","avatar","signals","tableId","seatId"];
    Object.keys(updates).forEach(k => { if (!allow.includes(k)) delete updates[k]; });

    // 若包含换桌/换座，store.updateRole 要做事务：释放旧座→占新座（有冲突抛错）
    const changed = await storeUpdateRole(req.params.id, updates); // <-- 需要在 store.ts 实现
    if (!changed) return res.status(404).json({ error: "ROLE_NOT_FOUND" });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "TABLE_NOT_FOUND") return res.status(404).json({ error: e.message });
    if (e?.message === "SEAT_TAKEN") return res.status(409).json({ error: e.message }); // 409 冲突 :contentReference[oaicite:3]{index=3}
    if (e?.message === "SEAT_OUT_OF_RANGE") return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "INTERNAL" });
  }
});

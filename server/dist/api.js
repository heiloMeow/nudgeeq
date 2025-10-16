"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
// src/api.ts
const express_1 = __importDefault(require("express"));
const nanoid_1 = require("nanoid");
const store_js_1 = require("./store.js");
exports.api = express_1.default.Router();
/* ---------------------------- 小工具 ---------------------------- */
function toSeatId(v) {
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new Error("SEAT_OUT_OF_RANGE");
    if (n < 1 || n > 6)
        throw new Error("SEAT_OUT_OF_RANGE");
    return n;
}
/* ---------------------------- 健康检查 ---------------------------- */
exports.api.get("/health", (_req, res) => res.json({ ok: true }));
/* ---------------------------- Tables ---------------------------- */
/** 附近桌子（用于 Nearby）：GET /api/tables?near=24&limit=5 */
exports.api.get("/tables", async (req, res) => {
    const near = String(req.query.near ?? "");
    const limit = Math.max(1, Math.min(20, Number(req.query.limit ?? 5)));
    const tables = await (0, store_js_1.getTables)();
    const roles = await (0, store_js_1.getRoles)();
    const sorted = near
        ? [...tables].sort((a, b) => Math.abs(Number(a.id) - Number(near)) -
            Math.abs(Number(b.id) - Number(near)))
        : tables;
    const pick = sorted.slice(0, limit);
    // 解引用 seat 的 roleId
    const out = pick.map((t) => ({
        id: t.id,
        seats: t.seats.map((rid) => {
            if (!rid)
                return null;
            const r = roles.find((rr) => rr.id === rid);
            return r
                ? { id: r.id, name: r.name, avatar: r.avatar, signals: r.signals ?? [] }
                : null;
        }),
    }));
    res.json(out);
});
/** 单桌占用（Step 2 选座）：GET /api/tables/:id */
exports.api.get("/tables/:id", async (req, res) => {
    const id = String(req.params.id);
    const t = await (0, store_js_1.findTable)(id);
    if (!t)
        return res.status(404).json({ error: "TABLE_NOT_FOUND" });
    const roles = await (0, store_js_1.getRoles)();
    const seats = t.seats.map((rid) => {
        if (!rid)
            return null;
        const r = roles.find((rr) => rr.id === rid);
        return r
            ? { id: r.id, name: r.name, avatar: r.avatar, signals: r.signals ?? [] }
            : null;
    });
    res.json({ id, seats }); // seats 长度恒为 6（null=空位）
});
/** 仅看是否被占（轻量轮询）：GET /api/tables/:id/availability */
exports.api.get("/tables/:id/availability", async (req, res) => {
    const id = String(req.params.id);
    const t = await (0, store_js_1.findTable)(id);
    if (!t)
        return res.status(404).json({ error: "TABLE_NOT_FOUND" });
    res.json({ id, taken: t.seats.map(Boolean) });
});
/* ---------------------------- Roles ---------------------------- */
/** 角色名列表（现有角色选择）：GET /api/roles?search=xx */
exports.api.get("/roles", async (req, res) => {
    const q = String(req.query.search ?? "").toLowerCase();
    const roles = await (0, store_js_1.getRoles)();
    const list = roles
        .filter((r) => !q || r.name.toLowerCase().includes(q))
        .slice(0, 20)
        .map((r) => ({ id: r.id, name: r.name }));
    res.json(list);
});
/** 获取单个角色（ContactCompose 左侧信息）：GET /api/roles/:id */
exports.api.get("/roles/:id", async (req, res) => {
    const roles = await (0, store_js_1.getRoles)();
    const role = roles.find((r) => r.id === req.params.id);
    if (!role)
        return res.status(404).json({ error: "ROLE_NOT_FOUND" });
    res.json({
        id: role.id,
        name: role.name,
        avatar: role.avatar,
        tableId: role.tableId,
        seatId: role.seatId,
        signals: role.signals ?? [],
        createdAt: role.createdAt,
    });
});
/** 创建最终角色（Finalize 的 Seek Help）：POST /api/roles */
exports.api.post("/roles", express_1.default.json(), async (req, res) => {
    try {
        const body = req.body;
        if (!body?.name || !body?.tableId || !body?.seatId || !body?.avatar) {
            return res.status(400).json({ error: "MISSING_FIELDS" });
        }
        const r = {
            id: body.id ?? (0, nanoid_1.nanoid)(8),
            name: String(body.name),
            avatar: String(body.avatar),
            signals: Array.isArray(body.signals) ? body.signals.map(String) : [],
            tableId: String(body.tableId),
            seatId: toSeatId(body.seatId),
            createdAt: new Date().toISOString(),
        };
        await (0, store_js_1.createRole)(r); // 可能抛出：TABLE_NOT_FOUND / SEAT_TAKEN / SEAT_OUT_OF_RANGE
        res.status(201).json({ id: r.id });
    }
    catch (e) {
        if (e?.message === "TABLE_NOT_FOUND")
            return res.status(404).json({ error: e.message });
        if (e?.message === "SEAT_TAKEN")
            return res.status(409).json({ error: e.message });
        if (e?.message === "SEAT_OUT_OF_RANGE")
            return res.status(400).json({ error: e.message });
        console.error(e);
        res.status(500).json({ error: "INTERNAL" });
    }
});
/** 通用编辑（可改 name/avatar/signals，或换桌换座）：PATCH /api/roles/:id */
exports.api.patch("/roles/:id", express_1.default.json(), async (req, res) => {
    try {
        const updates = req.body ?? {};
        const allow = new Set(["name", "avatar", "signals", "tableId", "seatId"]);
        for (const k of Object.keys(updates)) {
            if (!allow.has(k))
                delete updates[k];
        }
        if ("seatId" in updates)
            updates.seatId = toSeatId(updates.seatId);
        if ("signals" in updates && !Array.isArray(updates.signals))
            updates.signals = [];
        const changed = await (0, store_js_1.storeUpdateRole)(req.params.id, updates);
        if (!changed)
            return res.status(404).json({ error: "ROLE_NOT_FOUND" });
        res.json({ ok: true });
    }
    catch (e) {
        if (e?.message === "TABLE_NOT_FOUND")
            return res.status(404).json({ error: e.message });
        if (e?.message === "SEAT_TAKEN")
            return res.status(409).json({ error: e.message });
        if (e?.message === "SEAT_OUT_OF_RANGE")
            return res.status(400).json({ error: e.message });
        res.status(500).json({ error: "INTERNAL" });
    }
});
/** 仅改 signals（轻量端点）：PATCH /api/roles/:id/signals */
exports.api.patch("/roles/:id/signals", express_1.default.json(), async (req, res) => {
    try {
        const signals = Array.isArray(req.body?.signals)
            ? req.body.signals.map(String)
            : [];
        await (0, store_js_1.patchSignals)(req.params.id, signals);
        res.json({ ok: true });
    }
    catch (e) {
        if (e?.message === "ROLE_NOT_FOUND")
            return res.status(404).json({ error: e.message });
        res.status(500).json({ error: "INTERNAL" });
    }
});
/** 删除角色（释放座位）：DELETE /api/roles/:id */
exports.api.delete("/roles/:id", async (req, res) => {
    await (0, store_js_1.deleteRole)(req.params.id);
    res.json({ ok: true });
});
/* ---------------------------- Search ---------------------------- */
/** 信号关键词搜索（用于 Nearby 高亮）：GET /api/search/signals?q=xxx&limit=30 */
exports.api.get("/search/signals", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 30)));
    if (!q)
        return res.json([]);
    const rows = await (0, store_js_1.searchRolesBySignalFTS)(q, limit);
    // 期望 rows: [{ role:{id,name,avatar}, tableId, seatId? }]
    res.json(rows);
});
/* ---------------------------- Messages ---------------------------- */
/** 我发出的消息：GET /api/roles/:id/messages/sent?cursor=...&limit=20 */
exports.api.get("/roles/:id/messages/sent", async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const cursor = String(req.query.cursor ?? "");
    const out = await (0, store_js_1.getMessagesSent)(req.params.id, { cursor, limit });
    res.json(out);
});
/** 发给我的消息：GET /api/roles/:id/messages/received?cursor=...&limit=20 */
exports.api.get("/roles/:id/messages/received", async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const cursor = String(req.query.cursor ?? "");
    const out = await (0, store_js_1.getMessagesReceived)(req.params.id, { cursor, limit });
    res.json(out);
});
/** REST 发送消息（WS 离线兜底 / ContactCompose 发送）：POST /api/messages
 *  body: { fromRoleId: string, toRoleId: string, text: string }
 */
exports.api.post("/messages", express_1.default.json(), async (req, res) => {
    const { fromRoleId, toRoleId, text } = req.body ?? {};
    if (!fromRoleId || !toRoleId || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    try {
        const id = await (0, store_js_1.addMessage)(String(fromRoleId), String(toRoleId), text.trim());
        res.status(201).json({ id });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "INTERNAL" });
    }
});

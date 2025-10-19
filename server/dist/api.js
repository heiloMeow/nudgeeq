"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
// server/src/api.ts
const express_1 = __importDefault(require("express"));
const nanoid_1 = require("nanoid");
const store_js_1 = require("./store.js");
const events_js_1 = require("./events.js");
exports.api = express_1.default.Router();
/* ---------------------------- helpers ---------------------------- */
function toSeatId(v) {
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new Error("SEAT_OUT_OF_RANGE");
    if (n < 1 || n > 6)
        throw new Error("SEAT_OUT_OF_RANGE");
    return n;
}
/* ---------------------------- health ---------------------------- */
exports.api.get("/health", (_req, res) => res.json({ ok: true }));
/* ---------------------------- tables ---------------------------- */
/** Nearby tables (for Nearby page): GET /api/tables?near=24&limit=5 */
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
    // de-reference seat's roleId into occupant object
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
/** One table occupancy (step 2 Seat): GET /api/tables/:id */
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
    // seats length is always 6 (null = empty seat)
    res.json({ id, seats });
});
/** Lightweight availability (polling): GET /api/tables/:id/availability */
exports.api.get("/tables/:id/availability", async (req, res) => {
    const id = String(req.params.id);
    const t = await (0, store_js_1.findTable)(id);
    if (!t)
        return res.status(404).json({ error: "TABLE_NOT_FOUND" });
    res.json({ id, taken: t.seats.map(Boolean) });
});
/* ---------------------------- roles ---------------------------- */
/** Role list (existing role select): GET /api/roles?search=xx */
exports.api.get("/roles", async (req, res) => {
    const q = String(req.query.search ?? "").toLowerCase();
    const roles = await (0, store_js_1.getRoles)();
    const list = roles
        .filter((r) => !q || r.name.toLowerCase().includes(q))
        .slice(0, 20)
        .map((r) => ({ id: r.id, name: r.name }));
    res.json(list);
});
/** Get one role (left panel of ContactCompose): GET /api/roles/:id */
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
/** Create final role (Finalize "Seek Help"): POST /api/roles */
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
        // may throw: TABLE_NOT_FOUND / SEAT_TAKEN / SEAT_OUT_OF_RANGE
        await (0, store_js_1.createRole)(r);
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
/** Generic edit (name/avatar/signals/table/seat): PATCH /api/roles/:id */
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
/** Signals-only edit (lightweight): PATCH /api/roles/:id/signals */
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
/** Delete a role (free the seat): DELETE /api/roles/:id */
exports.api.delete("/roles/:id", async (req, res) => {
    await (0, store_js_1.deleteRole)(req.params.id);
    res.json({ ok: true });
});
/* ---------------------------- search ---------------------------- */
/** Signal keyword search (for Nearby highlight): GET /api/search/signals?q=xxx&limit=30
 * Expected rows: [{ role:{id,name,avatar}, tableId, seatId? }]
 * (Front-end is tolerant to alternative shapes.)
 */
exports.api.get("/search/signals", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 30)));
    if (!q)
        return res.json([]);
    const rows = await (0, store_js_1.searchRolesBySignalFTS)(q, limit);
    res.json(rows);
});
/* ---------------------------- messages ---------------------------- */
/** Sent box: GET /api/roles/:id/messages/sent?cursor=...&limit=20 */
exports.api.get("/roles/:id/messages/sent", async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const cursor = String(req.query.cursor ?? "");
    const out = await (0, store_js_1.getMessagesSent)(req.params.id, { cursor, limit });
    res.json(out);
});
/** Inbox: GET /api/roles/:id/messages/received?cursor=...&limit=20 */
exports.api.get("/roles/:id/messages/received", async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const cursor = String(req.query.cursor ?? "");
    const out = await (0, store_js_1.getMessagesReceived)(req.params.id, { cursor, limit });
    res.json(out);
});
/** REST send message (fallback when WS is offline / used by ContactCompose)
 * body: { fromRoleId: string, toRoleId: string, text: string }
 */
exports.api.post("/messages", express_1.default.json(), async (req, res) => {
    const { fromRoleId, toRoleId, text, kind, inReplyTo } = req.body ?? {};
    if (!fromRoleId || !toRoleId || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    try {
        // 可选：校验角色存在，避免“孤儿消息”
        const roles = await (0, store_js_1.getRoles)();
        const okFrom = roles.some(r => r.id === String(fromRoleId));
        const okTo = roles.some(r => r.id === String(toRoleId));
        if (!okFrom || !okTo)
            return res.status(404).json({ error: "ROLE_NOT_FOUND" });
        const safeKind = kind === "response" ? "response" : "request";
        const msg = await (0, store_js_1.addMessage)(String(fromRoleId), String(toRoleId), text.trim(), safeKind, inReplyTo ? String(inReplyTo) : undefined);
        // 若已启用 SSE，推给双方
        try {
            (0, events_js_1.publish)(String(toRoleId), "message", { ...msg, dir: "in" });
            (0, events_js_1.publish)(String(fromRoleId), "message", { ...msg, dir: "out" });
        }
        catch { }
        res.status(201).json({ id: msg.id });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "INTERNAL" });
    }
});

// server/src/store.ts
import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { nanoid } from "nanoid";
import type { Role, TableRow } from "./types.js";

let db!: InstanceType<typeof Database>;

/** 初始化 SQLite（自动建表与种子桌号） */
export function initDB() {
  const file = process.env.DB_FILE ?? resolve("data/db.sqlite");
  try { mkdirSync(dirname(file), { recursive: true }); } catch {}

  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      avatar    TEXT NOT NULL,
      signals   TEXT NOT NULL DEFAULT '[]',   -- JSON string
      tableId   TEXT NOT NULL,
      seatId    INTEGER NOT NULL CHECK(seatId BETWEEN 1 AND 6),
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tables ( id TEXT PRIMARY KEY );
    CREATE TABLE IF NOT EXISTS seats (
      tableId   TEXT NOT NULL,
      seatIndex INTEGER NOT NULL CHECK(seatIndex BETWEEN 0 AND 5),
      roleId    TEXT NULL,
      PRIMARY KEY (tableId, seatIndex),
      FOREIGN KEY (tableId) REFERENCES tables(id) ON DELETE CASCADE
    );

    -- 消息
    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      fromRoleId TEXT NOT NULL,
      toRoleId   TEXT NOT NULL,
      text       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'request' CHECK(kind IN ('request','response')),
      inReplyTo  TEXT NULL,
      createdAt  TEXT NOT NULL,
      FOREIGN KEY (fromRoleId) REFERENCES roles(id),
      FOREIGN KEY (toRoleId)   REFERENCES roles(id)
    );
    CREATE INDEX IF NOT EXISTS idx_msg_from_time ON messages(fromRoleId, createdAt DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_msg_to_time   ON messages(toRoleId,   createdAt DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_msg_inreply   ON messages(inReplyTo);

    -- 信号 FTS：把 roles.signals(JSON) 拆成行式 role_signals 再喂给 FTS5
    CREATE TABLE IF NOT EXISTS role_signals ( roleId TEXT NOT NULL, signal TEXT NOT NULL );
    CREATE VIRTUAL TABLE IF NOT EXISTS role_signals_fts
      USING fts5(
        signal,
        content='role_signals',
        content_rowid='rowid'
      );

    CREATE TRIGGER IF NOT EXISTS role_signals_ai AFTER INSERT ON role_signals BEGIN
      INSERT INTO role_signals_fts(rowid, signal) VALUES (new.rowid, new.signal);
    END;
    CREATE TRIGGER IF NOT EXISTS role_signals_ad AFTER DELETE ON role_signals BEGIN
      INSERT INTO role_signals_fts(role_signals_fts, rowid, signal) VALUES ('delete', old.rowid, old.signal);
    END;
    CREATE TRIGGER IF NOT EXISTS role_signals_au AFTER UPDATE ON role_signals BEGIN
      INSERT INTO role_signals_fts(role_signals_fts, rowid, signal) VALUES ('delete', old.rowid, old.signal);
      INSERT INTO role_signals_fts(rowid, signal) VALUES (new.rowid, new.signal);
    END;
  `);

  // 兼容旧库：若缺列则补列
  ensureColumn("messages", "kind",      "TEXT NOT NULL DEFAULT 'request'");
  ensureColumn("messages", "inReplyTo", "TEXT NULL");

  // 首次种子桌号
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM tables`).get() as any).c as number;
  if (count === 0) {
    const ids = (process.env.SEED_TABLES ?? "24,12,23,25")
      .split(",").map(s => s.trim()).filter(Boolean);
    const insertTable = db.prepare(`INSERT INTO tables(id) VALUES (?)`);
    const insertSeat  = db.prepare(`INSERT INTO seats(tableId, seatIndex, roleId) VALUES (?, ?, NULL)`);
    const tx = db.transaction(() => {
      for (const id of ids) {
        insertTable.run(id);
        for (let i = 0; i < 6; i++) insertSeat.run(id, i);
      }
    });
    tx();
  }
}

/* -------------------- 查询 -------------------- */

export async function getTables(): Promise<TableRow[]> {
  const rows = db.prepare(`SELECT id FROM tables ORDER BY CAST(id AS INTEGER)`).all() as { id: string }[];
  const seatStmt = db.prepare(
    `SELECT seatIndex, roleId FROM seats WHERE tableId = ? ORDER BY seatIndex`
  );
  return rows.map((r) => {
    const seats = new Array<string | null>(6).fill(null);
    const rs = seatStmt.all(r.id) as { seatIndex: number; roleId: string | null }[];
    for (const s of rs) seats[s.seatIndex] = s.roleId ?? null;
    return { id: r.id, seats };
  });
}

export async function getRoles(): Promise<Role[]> {
  const rs = db.prepare(`SELECT * FROM roles`).all() as any[];
  return rs.map((r) => ({ ...r, signals: safeParse(r.signals, [] as string[]) }));
}

export async function findTable(id: string): Promise<TableRow | undefined> {
  const t = db.prepare(`SELECT id FROM tables WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!t) return undefined;
  const seats = new Array<string | null>(6).fill(null);
  const rs = db.prepare(`SELECT seatIndex, roleId FROM seats WHERE tableId = ?`).all(id) as any[];
  for (const s of rs) seats[s.seatIndex] = s.roleId ?? null;
  return { id, seats };
}

/* -------------------- 写入：角色/座位 -------------------- */

export async function createRole(r: Role) {
  const seatIdx = r.seatId - 1;
  const tx = db.transaction(() => {
    const table = db.prepare(`SELECT id FROM tables WHERE id = ?`).get(r.tableId);
    if (!table) throw new Error("TABLE_NOT_FOUND");

    ensureSeatAvailable(r.tableId, seatIdx);

    db.prepare(
      `INSERT INTO roles(id,name,avatar,signals,tableId,seatId,createdAt)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      r.id, r.name, r.avatar, JSON.stringify(r.signals ?? []),
      r.tableId, r.seatId, r.createdAt
    );

    db.prepare(`UPDATE seats SET roleId = ? WHERE tableId = ? AND seatIndex = ?`)
      .run(r.id, r.tableId, seatIdx);

    replaceRoleSignals(r.id, r.signals ?? []);
  });
  tx();
}


// lazily created transaction to avoid calling db.transaction() before initDB()
let _txDeleteRole: ((roleId: string) => void) | null = null;

export function deleteRole(roleId: string) {
  if (!_txDeleteRole) {
    if (!db) throw new Error("DB_NOT_INITIALIZED");

    _txDeleteRole = db.transaction((rid: string) => {
      const role = db.prepare(`
        SELECT tableId, seatId
        FROM roles
        WHERE id = ?
      `).get(rid) as { tableId?: string; seatId?: number } | undefined;

      if (role?.tableId && typeof role.seatId === "number") {
        const seatIdx = role.seatId - 1;
        if (seatIdx >= 0 && seatIdx <= 5) {
          db.prepare(`
            UPDATE seats
            SET roleId = NULL
            WHERE tableId = ? AND seatIndex = ?
          `).run(role.tableId, seatIdx);
        }
      }

      db.prepare(`DELETE FROM role_signals WHERE roleId = ?`).run(rid);
      db.prepare(`DELETE FROM messages WHERE fromRoleId = ? OR toRoleId = ?`).run(rid, rid);
      db.prepare(`DELETE FROM roles WHERE id = ?`).run(rid);
    });
  }

  _txDeleteRole(roleId);
}



export async function patchSignals(roleId: string, signals: string[]) {
  const info = db.prepare(`UPDATE roles SET signals = ? WHERE id = ?`)
    .run(JSON.stringify(signals ?? []), roleId);
  if (info.changes === 0) throw new Error("ROLE_NOT_FOUND");
  replaceRoleSignals(roleId, signals ?? []);
}

/* -------------------- 角色通用编辑（含换座） -------------------- */
export async function storeUpdateRole(
  roleId: string,
  updates: Partial<{ name: string; avatar: string; signals: string[]; tableId: string; seatId: number; }>
): Promise<boolean> {
  const tx = db.transaction(() => {
    const row = db.prepare(`SELECT * FROM roles WHERE id = ?`).get(roleId) as any;
    if (!row) return false;

    const next = {
      name:   updates.name   ?? row.name,
      avatar: updates.avatar ?? row.avatar,
      tableId: String(updates.tableId ?? row.tableId),
      seatId:  Number(updates.seatId  ?? row.seatId),
      signals: Array.isArray(updates.signals) ? updates.signals : safeParse(row.signals, [] as string[]),
    };

    const moved = next.tableId !== row.tableId || next.seatId !== row.seatId;
    if (moved) {
      const seatIdxNew = next.seatId - 1;
      if (seatIdxNew < 0 || seatIdxNew > 5) throw new Error("SEAT_OUT_OF_RANGE");

      const table = db.prepare(`SELECT id FROM tables WHERE id = ?`).get(next.tableId);
      if (!table) throw new Error("TABLE_NOT_FOUND");

      ensureSeatAvailable(next.tableId, seatIdxNew, roleId);

      // 释放旧座、占新座
      db.prepare(`UPDATE seats SET roleId = NULL WHERE tableId = ? AND seatIndex = ?`)
        .run(row.tableId, row.seatId - 1);
      db.prepare(`UPDATE seats SET roleId = ? WHERE tableId = ? AND seatIndex = ?`)
        .run(roleId, next.tableId, seatIdxNew);
    }

    db.prepare(
      `UPDATE roles SET name=?, avatar=?, signals=?, tableId=?, seatId=? WHERE id=?`
    ).run(
      next.name, next.avatar, JSON.stringify(next.signals ?? []),
      next.tableId, next.seatId, roleId
    );

    replaceRoleSignals(roleId, next.signals ?? []);
    return true;
  });
  return tx();
}

/* -------------------- FTS 搜索（signal -> 角色+桌号） -------------------- */
// 安全的 signals 关键词搜索（不依赖 FTS，使用 JSON1 + LIKE）
// 安全的 signals 关键词搜索（JSON1 + LIKE，参数化；不依赖 FTS 表）
export function searchRolesBySignalFTS(q: string, limit: number) {
  const terms = String(q || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return [];

  // 每个词都变成一个 EXISTS 子句；OR = 命中任意词即可（需要“全都命中”就把 OR 改 AND）
  const wheres = terms.map(
    () => `EXISTS (
              SELECT 1
              FROM json_each(COALESCE(r.signals, '[]'))
              WHERE CAST(json_each.value AS TEXT) LIKE ?
           )`
  );

  const sql = `
    SELECT r.id, r.name, r.avatar, r.tableId, r.seatId, r.createdAt
    FROM roles r
    WHERE ${wheres.join(" OR ")}
    ORDER BY datetime(r.createdAt) DESC
    LIMIT ?;
  `;

  const params = [
    ...terms.map(t => `%${t}%`),
    Math.max(1, Math.min(100, Number(limit) || 30)),
  ];

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; name: string; avatar: string; tableId: string; seatId?: number; createdAt?: string;
  }>;

  // 与 /api/search/signals 期望结构对齐
  return rows.map(r => ({
    role: { id: r.id, name: r.name, avatar: r.avatar },
    tableId: r.tableId,
    seatId: r.seatId,
  }));
}



/* -------------------- 消息：入库与分页查询（Keyset 游标） -------------------- */
export async function addMessage(
  fromRoleId: string,
  toRoleId: string,
  text: string,
  kind: "request" | "response" = "request",
  inReplyTo?: string
): Promise<{ id: string; fromRoleId: string; toRoleId: string; text: string; kind: "request"|"response"; inReplyTo?: string; createdAt: string }> {
  const id = nanoid(10);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages(id, fromRoleId, toRoleId, text, kind, inReplyTo, createdAt)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, fromRoleId, toRoleId, text, kind, inReplyTo ?? null, createdAt);
  return { id, fromRoleId, toRoleId, text, kind, inReplyTo, createdAt };
}

export async function getMessagesSent(
  roleId: string,
  opt: { cursor?: string; limit: number }
): Promise<{
  items: Array<{
    id: string;
    to: { id: string; name: string };
    text: string;
    createdAt: string;
    // ↓ 新增：前端刷新后也能还原
    fromRoleId: string;
    toRoleId: string;
    kind: "request" | "response";
    inReplyTo?: string | null;
  }>;
  nextCursor?: string;
}> {
  const { ts, lastId } = parseCursor(opt.cursor);
  const base = `
    SELECT
      m.id           AS id,
      m.text         AS text,
      m.createdAt    AS createdAt,
      m.kind         AS kind,
      m.inReplyTo    AS inReplyTo,
      m.fromRoleId   AS fromRoleId,
      m.toRoleId     AS toRoleId,
      rto.id         AS toId,
      rto.name       AS toName
    FROM messages m
    JOIN roles rto ON rto.id = m.toRoleId
    WHERE m.fromRoleId = ?
  `;
  const cond  = ts ? `AND (m.createdAt < ? OR (m.createdAt = ? AND m.id < ?))` : ``;
  const order = `ORDER BY m.createdAt DESC, m.id DESC LIMIT ?`;

  const params: any[] = [roleId];
  if (ts) params.push(ts, ts, lastId);
  params.push(opt.limit);

  const rows = db.prepare(`${base} ${cond} ${order}`).all(...params) as any[];
  const items = rows.map(r => ({
    id: r.id,
    to: { id: r.toId, name: r.toName },
    text: r.text,
    createdAt: r.createdAt,
    // 新增的扁平字段
    fromRoleId: r.fromRoleId,
    toRoleId: r.toRoleId,
    kind: r.kind as "request" | "response",
    inReplyTo: r.inReplyTo ?? null,
  }));
  const nextCursor =
    items.length === opt.limit
      ? `${items[items.length - 1].createdAt}_${items[items.length - 1].id}`
      : undefined;
  return { items, nextCursor };
}


export async function getMessagesReceived(
  roleId: string,
  opt: { cursor?: string; limit: number }
): Promise<{
  items: Array<{
    id: string;
    from: { id: string; name: string };
    text: string;
    createdAt: string;
    // ↓ 新增：前端刷新后也能还原
    fromRoleId: string;
    toRoleId: string;
    kind: "request" | "response";
    inReplyTo?: string | null;
  }>;
  nextCursor?: string;
}> {
  const { ts, lastId } = parseCursor(opt.cursor);
  const base = `
    SELECT
      m.id           AS id,
      m.text         AS text,
      m.createdAt    AS createdAt,
      m.kind         AS kind,
      m.inReplyTo    AS inReplyTo,
      m.fromRoleId   AS fromRoleId,
      m.toRoleId     AS toRoleId,
      rfrom.id       AS fromId,
      rfrom.name     AS fromName
    FROM messages m
    JOIN roles rfrom ON rfrom.id = m.fromRoleId
    WHERE m.toRoleId = ?
  `;
  const cond  = ts ? `AND (m.createdAt < ? OR (m.createdAt = ? AND m.id < ?))` : ``;
  const order = `ORDER BY m.createdAt DESC, m.id DESC LIMIT ?`;

  const params: any[] = [roleId];
  if (ts) params.push(ts, ts, lastId);
  params.push(opt.limit);

  const rows = db.prepare(`${base} ${cond} ${order}`).all(...params) as any[];
  const items = rows.map(r => ({
    id: r.id,
    from: { id: r.fromId, name: r.fromName },
    text: r.text,
    createdAt: r.createdAt,
    // 新增的扁平字段
    fromRoleId: r.fromRoleId,
    toRoleId: r.toRoleId,
    kind: r.kind as "request" | "response",
    inReplyTo: r.inReplyTo ?? null,
  }));
  const nextCursor =
    items.length === opt.limit
      ? `${items[items.length - 1].createdAt}_${items[items.length - 1].id}`
      : undefined;
  return { items, nextCursor };
}


/* -------------------- 小工具 -------------------- */

function ensureColumn(table: string, name: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.some(c => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Ensure the requested seat is usable. If the seat references a role that no
 * longer exists (legacy/orphaned data), clear the stale pointer so the seat can
 * be reused. Optionally allow the current role to keep its seat when moving.
 */
function ensureSeatAvailable(tableId: string, seatIdx: number, allowRoleId?: string) {
  const seat = db.prepare(
    `SELECT roleId FROM seats WHERE tableId = ? AND seatIndex = ?`
  ).get(tableId, seatIdx) as { roleId: string | null } | undefined;

  if (!seat) throw new Error("SEAT_OUT_OF_RANGE");
  if (!seat.roleId) return;
  if (allowRoleId && seat.roleId === allowRoleId) return;

  const owner = db.prepare(`SELECT id FROM roles WHERE id = ?`).get(seat.roleId) as { id: string } | undefined;
  if (!owner) {
    db.prepare(`UPDATE seats SET roleId = NULL WHERE tableId = ? AND seatIndex = ?`).run(tableId, seatIdx);
    return;
  }

  throw new Error("SEAT_TAKEN");
}

function safeParse<T>(s: string, d: T): T {
  try { return JSON.parse(s) as T; } catch { return d; }
}
function normalizeSignal(s: string) { return s.trim().toLowerCase(); }

function replaceRoleSignals(roleId: string, signals: string[]) {
  const del = db.prepare(`DELETE FROM role_signals WHERE roleId = ?`);
  const ins = db.prepare(`INSERT INTO role_signals(roleId, signal) VALUES (?, ?)`);
  const tx = db.transaction(() => {
    del.run(roleId);
    for (const sig of signals ?? []) {
      const v = normalizeSignal(sig);
      if (v) ins.run(roleId, v);
    }
  });
  tx();
}

function parseCursor(cursor?: string): { ts?: string; lastId?: string } {
  if (!cursor) return {};
  const i = cursor.lastIndexOf("_");
  if (i <= 0) return {};
  const ts = cursor.slice(0, i);
  const id = cursor.slice(i + 1);
  if (!ts || !id) return {};
  return { ts, lastId: id };
}

// server/src/store.ts
import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { Role, TableRow } from "./types.js";

let db: Database.Database;

/** 初始化 SQLite（自动建表与种子桌号） */
export function initDB() {
  const file = process.env.DB_FILE ?? resolve("data/db.sqlite");
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
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY
    );
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
    createdAt  TEXT NOT NULL,
    FOREIGN KEY (fromRoleId) REFERENCES roles(id),
    FOREIGN KEY (toRoleId)   REFERENCES roles(id)
    );
    CREATE INDEX IF NOT EXISTS idx_msg_from_time ON messages(fromRoleId, createdAt DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_msg_to_time   ON messages(toRoleId,   createdAt DESC, id DESC);

    -- 信号 FTS：把 roles.signals(JSON) 拆成行式 role_signals 再喂给 FTS5
    CREATE TABLE IF NOT EXISTS role_signals ( roleId TEXT NOT NULL, signal TEXT NOT NULL );
    CREATE VIRTUAL TABLE IF NOT EXISTS role_signals_fts
    USING fts5(signal, content='role_signals', content_rowid='rowid');

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

  // 首次运行自动创建一些桌号（可用 SEED_TABLES 覆盖：例如 "24,12,25,23"）
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM tables`).get() as any).c as number;
  if (count === 0) {
    const ids = (process.env.SEED_TABLES ?? "24,12,25,23")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const insertTable = db.prepare(`INSERT INTO tables(id) VALUES (?)`);
    const insertSeat = db.prepare(`INSERT INTO seats(tableId, seatIndex, roleId) VALUES (?, ?, NULL)`);
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
  return rs.map((r) => ({
    ...r,
    signals: safeParse(r.signals, [] as string[]),
  }));
}

export async function findTable(id: string): Promise<TableRow | undefined> {
  const t = db.prepare(`SELECT id FROM tables WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!t) return undefined;
  const seats = new Array<string | null>(6).fill(null);
  const rs = db.prepare(`SELECT seatIndex, roleId FROM seats WHERE tableId = ?`).all(id) as any[];
  for (const s of rs) seats[s.seatIndex] = s.roleId ?? null;
  return { id, seats };
}

/* -------------------- 写入 -------------------- */

export async function createRole(r: Role) {
  const seatIdx = r.seatId - 1;
  const tx = db.transaction(() => {
    const table = db.prepare(`SELECT id FROM tables WHERE id = ?`).get(r.tableId);
    if (!table) throw new Error("TABLE_NOT_FOUND");

    const seat = db
      .prepare(`SELECT roleId FROM seats WHERE tableId = ? AND seatIndex = ?`)
      .get(r.tableId, seatIdx) as { roleId: string | null } | undefined;

    if (!seat) throw new Error("SEAT_OUT_OF_RANGE");
    if (seat.roleId) throw new Error("SEAT_TAKEN");

    db.prepare(
      `INSERT INTO roles(id,name,avatar,signals,tableId,seatId,createdAt)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      r.id,
      r.name,
      r.avatar,
      JSON.stringify(r.signals ?? []),
      r.tableId,
      r.seatId,
      r.createdAt
    );

    db.prepare(`UPDATE seats SET roleId = ? WHERE tableId = ? AND seatIndex = ?`).run(
      r.id,
      r.tableId,
      seatIdx
    );
  });
  tx();
}

export async function deleteRole(roleId: string) {
  const tx = db.transaction(() => {
    const r = db
      .prepare(`SELECT tableId, seatId FROM roles WHERE id = ?`)
      .get(roleId) as { tableId: string; seatId: number } | undefined;
    if (!r) return;
    db.prepare(`DELETE FROM roles WHERE id = ?`).run(roleId);
    db.prepare(`UPDATE seats SET roleId = NULL WHERE tableId = ? AND seatIndex = ?`).run(
      r.tableId,
      r.seatId - 1
    );
  });
  tx();
}

export async function patchSignals(roleId: string, signals: string[]) {
  const info = db
    .prepare(`UPDATE roles SET signals = ? WHERE id = ?`)
    .run(JSON.stringify(signals ?? []), roleId);
  if (info.changes === 0) throw new Error("ROLE_NOT_FOUND");
}

/* -------------------- 小工具 -------------------- */
function safeParse<T>(s: string, d: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
}
// 通用编辑（内部做事务；若换座需校验冲突）
export async function storeUpdateRole(
  roleId: string,
  updates: Partial<{ name: string; avatar: string; signals: string[]; tableId: string; seatId: number; }>
): Promise<boolean>;

// FTS 搜索（q 支持多词，limit 上限 100）
export async function searchRolesBySignalFTS(
  q: string,
  limit: number
): Promise<Array<{ role: { id: string; name: string; avatar: string }, tableId: string }>>;

// 消息（插入 + 两种分页获取）
export async function addMessage(fromRoleId: string, toRoleId: string, text: string): Promise<string>;
export async function getMessagesSent(
  roleId: string,
  opt: { cursor?: string; limit: number }
): Promise<{ items: Array<{ id: string; to: {id:string; name:string}; text: string; createdAt: string }>, nextCursor?: string }>;

export async function getMessagesReceived(
  roleId: string,
  opt: { cursor?: string; limit: number }
): Promise<{ items: Array<{ id: string; from: {id:string; name:string}; text: string; createdAt: string }>, nextCursor?: string }>;

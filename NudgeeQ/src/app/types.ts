// src/types.ts
export type SeatId = 1|2|3|4|5|6;  // 更严格也可以直接用 number
export type TableId = string;

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Message {
  id: string;
  text: string;
  ts: number;
  // 会话上下文（可选）
  context?: {
    tableId?: TableId;
    seatId?: SeatId;
  };
  // 统一用 from/to，逐步替代旧的 user/seatId
  from: Pick<User, "id" | "name">;
  to?:  Pick<User, "id" | "name">;
}

// WebSocket：支持按座位的房间聊天 + 直连聊天
export type Outgoing =
  | { action: "joinSeat"; tableId: TableId; seatId: SeatId; user: User }
  | { action: "sendSeatMessage"; tableId: TableId; seatId: SeatId; text: string } // 房间消息
  | { action: "direct"; to: string; text: string };                                // 私聊

export type Incoming =
  | { type: "system"; text: string }
  | { type: "seatMessage"; payload: Message }   // 房间消息
  | { type: "direct"; from: User; text: string; ts: number }; // 私聊

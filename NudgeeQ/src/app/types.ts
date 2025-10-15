export type SeatId = string;

export interface User {
  id: string;       // 随机或后端回传
  name: string;
  avatar?: string;
}

export interface Message {
  id: string;
  seatId: SeatId;
  user: Pick<User, "id" | "name">;
  text: string;
  ts: number;
}

// 与后端约定的 WebSocket 出入参
export type Outgoing =
  | { action: "joinSeat"; seatId: SeatId; user: User }
  | { action: "sendMessage"; seatId: SeatId; user: User; text: string };

export type Incoming =
  | { type: "system"; text: string }
  | { type: "message"; payload: Message };

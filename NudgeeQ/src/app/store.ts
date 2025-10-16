// src/app/store.ts
import { create } from "zustand";
import type { Message, SeatId, User } from "./types";

const LS_KEY = "nudgeeq_users";

interface RoomState {
  tableId?: string | number;  // 当前桌号（Nearby / 跳转时会用到）
  seatId?: SeatId;            // 可选：进房时也能放这里
}

interface State {
  // ====== 草稿 & 最终确认 ======
  draftUser?: User;
  setDraftUser: (u: User | undefined) => void;
  commitUser: (u?: User) => void;  // 最终确认时调用：写入 user + 本地历史

  // ====== 用户 / 房间 / 消息 ======
  user?: User;
  room?: RoomState;
  seatId?: SeatId;                  // 兼容老代码用的 seatId
  messages: Message[];

  setUser: (u: User) => void;
  setRoom: (r: RoomState | undefined) => void;

  joinSeatLocal: (seatId: SeatId) => void;

  setMessages: (list: Message[]) => void; // 一次性覆盖（加载历史时用）
  pushMessage: (m: Message) => void;      // 追加一条

  clear: () => void;                      // 清空消息（保留 user/room）
}

export const useApp = create<State>((set, get) => ({
  // ====== 草稿 & 最终确认 ======
  draftUser: undefined,
  setDraftUser: (u) => set({ draftUser: u }),
  commitUser: (u) => {
    const useU = u ?? get().draftUser;
    if (!useU) return;

    // 写入最终 user
    set({ user: useU });

    // 写入历史（此处才落盘）
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [useU.name, ...list.filter((n) => n !== useU.name)].slice(0, 12);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // 忽略本地存储异常
    }

    // 清掉草稿
    set({ draftUser: undefined });
  },

  // ====== 用户 / 房间 / 消息 ======
  user: undefined,
  room: undefined,
  seatId: undefined,
  messages: [],

  setUser: (u) => set({ user: u }),
  setRoom: (r) => set({ room: r }),

  // 兼容：本地加入座位（旧代码可能还用到这个）
  joinSeatLocal: (seatId) => set({ seatId, messages: [] }),

  // 消息列表
  setMessages: (list) => set({ messages: list ?? [] }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),

  // 清空当前会话消息
  clear: () => set({ messages: [] }),
}));

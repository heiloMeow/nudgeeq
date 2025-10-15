// src/app/store.ts
import { create } from "zustand";
import type { Message, SeatId, User } from "./types";

const LS_KEY = "nudgeeq_users";

interface State {
  // ✅ 新增
  draftUser?: User;
  setDraftUser: (u: User | undefined) => void;
  commitUser: (u?: User) => void;  // 最终确认时调用：写入 user + 本地历史

  // 你原本的
  user?: User;
  seatId?: SeatId;
  messages: Message[];
  setUser: (u: User) => void;            // 如果别处用了也保留
  joinSeatLocal: (seatId: SeatId) => void;
  pushMessage: (m: Message) => void;
  clear: () => void;
}

export const useApp = create<State>((set, get) => ({
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
    } catch {}
    // 清掉草稿
    set({ draftUser: undefined });
  },

  user: undefined,
  seatId: undefined,
  messages: [],
  setUser: (u) => set({ user: u }),
  joinSeatLocal: (seatId) => set({ seatId, messages: [] }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  clear: () => set({ messages: [] }),
}));

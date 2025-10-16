// src/features/inbox/IncomingModal.tsx
import React from "react";
import type { IncomingItem } from "./useIncomingRequests";

export function IncomingModal({
  open, item, tableLabel, onSure, onSorry, onIgnore,
}: {
  open: boolean;
  item: IncomingItem | null;
  tableLabel?: string; // "From Table 24"
  onSure: () => void;
  onSorry: () => void;
  onIgnore: () => void;
}) {
  if (!open || !item) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-title"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-white text-[#1a1222] shadow-[0_40px_120px_rgba(0,0,0,.45)]">
        <div className="px-8 pt-8 text-center">
          <div id="incoming-title" className="font-display text-[clamp(20px,3.2vw,28px)] text-brand-700">
            {tableLabel ?? "New Request"}
          </div>
          <div className="mt-6 mb-2 font-display text-[clamp(22px,4.2vw,34px)] leading-snug">
            {item.text}
          </div>
        </div>

        <div className="px-8 pb-8 pt-4 grid grid-cols-3 gap-4">
          <button
            onClick={onSorry}
            className="rounded-xl py-3 bg-[#f1e6f6] hover:bg-[#eadaf3] font-semibold"
          >
            SORRY
          </button>
          <button
            onClick={onIgnore}
            className="rounded-xl py-3 bg-[#efecef] hover:bg-[#e7e3e7] font-semibold"
          >
            IGNORE
          </button>
          <button
            onClick={onSure}
            className="rounded-xl py-3 bg-[#e9def5] hover:bg-[#e2d3f2] font-semibold"
          >
            SURE
          </button>
        </div>
      </div>
    </div>
  );
}

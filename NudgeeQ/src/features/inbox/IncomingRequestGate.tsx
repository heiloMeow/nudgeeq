// src/features/inbox/IncomingRequestGate.tsx
import { useCallback, useState } from "react";
import { useApp } from "../../app/store";
import { useEventStream, type PushMessage } from "./useEventStream";
import { IncomingModal } from "./IncomingModal";
import Toasts, { useToasts } from "./Toasts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const REPLY_SORRY = "Sorry, I can’t help right now.";
const REPLY_SURE  = "Sure, I’m on my way.";

export default function IncomingRequestGate() {
  const { user } = useApp();
  const myRoleId = user?.id;
  const [queue, setQueue] = useState<PushMessage[]>([]);
  const { addToast, renderer: ToastRenderer } = useToasts();

  const onPush = useCallback((m: PushMessage) => {
    if (m.toRoleId !== myRoleId) return; // 只关心发给我的
    if (m.kind === "request") {
      setQueue(q => q.some(x => x.id === m.id) ? q : [...q, m]);
    } else if (m.kind === "response") {
      addToast({ text: m.text, fromRoleId: m.fromRoleId });
    }
  }, [myRoleId, addToast]);

  useEventStream(myRoleId, onPush);

  async function reply(text: string, inReplyTo: string, toRoleId: string) {
    if (!myRoleId) return;
    try {
      await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRoleId: myRoleId, toRoleId, text, kind: "response", inReplyTo }),
      });
    } finally {
      setQueue(q => q.slice(1));
    }
  }

  const cur = queue[0] ?? null;

  return (
    <>
      <IncomingModal
        open={!!cur}
        item={cur && { id: cur.id, text: cur.text, createdAt: cur.createdAt, from: { id: cur.fromRoleId, name: "" } }}
        tableLabel={"Request"}
        onSorry={() => cur && reply(REPLY_SORRY, cur.id, cur.fromRoleId)}
        onSure={() => cur && reply(REPLY_SURE,  cur.id, cur.fromRoleId)}
        onIgnore={() => setQueue(q => q.slice(1))}
      />
      <ToastRenderer />
    </>
  );
}

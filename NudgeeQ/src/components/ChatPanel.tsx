import { type FormEvent, useEffect, useRef, useState } from "react";
import { onMessage, send } from "../app/ws";
import { useApp } from "../app/store";
import type { Message } from "../app/types";

export default function ChatPanel() {
  const { user, seatId, messages, pushMessage } = useApp();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => onMessage((msg) => {
    if (msg.type === "message") pushMessage(msg.payload);
  }), [pushMessage]);

  useEffect(() => { listRef.current?.scrollTo(0, 9e9); }, [messages.length]);

  const sendMsg = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !seatId || !text.trim()) return;
    const temp: Message = { id: crypto.randomUUID(), seatId, user, text: text.trim(), ts: Date.now() };
    // 先本地回显，后端广播回来时也会覆盖/补齐
    pushMessage(temp);
    send({ action: "sendMessage", seatId, user, text: temp.text });
    setText("");
  };

  return (
    <div>
      <div ref={listRef} style={{height:280, overflow:"auto", border:"1px solid #333", padding:8}}>
        {messages.map(m => <div key={m.id}><b>{m.user.name}：</b>{m.text}</div>)}
      </div>
      <form onSubmit={sendMsg} style={{marginTop:8}}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="发消息给同座位的人…" />
        <button type="submit">发送</button>
      </form>
    </div>
  );
}

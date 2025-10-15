
import ChatPanel from "../components/ChatPanel";
import { useApp } from "../app/store";

export default function Room(){
  const seatId = useApp(s=>s.seatId);
  return (
    <div>
      <h2>座位 {seatId}</h2>
      <ChatPanel/>
    </div>
  );
}

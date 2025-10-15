import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import RoleSelect from "./pages/RoleSelect";
import TableSelect from "./pages/TableSelect";
import SeatSelect from "./pages/SeatSelect";
import StatusSelect from "./pages/StatusSelect";
import SignalSelect from "./pages/SignalSelect";
import Room from "./pages/Room";

// 可选：简单“路由守卫”，确保按顺序完成（示例）
import { useApp } from "./app/store";
function RequireDraft({ children }: { children: React.ReactNode }) {
  const { draftUser } = useApp();
  return draftUser ? <>{children}</> : <Navigate to="/role" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/role" element={<RoleSelect onBack={() => history.back()} onNext={() => { /* 用 navigate 写在页内 */ }} />} />
      <Route path="/table" element={<RequireDraft><TableSelect onBack={() => history.back()} onNext={() => { /* 页内跳转 */ }} /></RequireDraft>} />
      <Route path="/seat" element={<RequireDraft><SeatSelect tableId={"1"} onBack={() => history.back()} onNext={() => {}} /></RequireDraft>} />
      <Route path="/status" element={<RequireDraft><StatusSelect onBack={() => history.back()} onDone={() => {}} /></RequireDraft>} />
      <Route path="/signal" element={<RequireDraft><SignalSelect avatarSrc="" onBack={() => {}} onDone={() => {}} /></RequireDraft>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

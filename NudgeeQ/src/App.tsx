// NudgeeQ/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";

// 页面
import Home from "./pages/Home";
import RoleSelect from "./pages/RoleSelect";
import TableSelect from "./pages/TableSelect";
import SeatSelect from "./pages/SeatSelect";
import StatusSelect from "./pages/StatusSelect";
import SignalSelect from "./pages/SignalSelect";
import Finalize from "./pages/Finalize";
import NearbyTables from "./pages/NearbyTables";

// 全局 store（草稿用户等）
import { useApp } from "./app/store";

// 简单守卫：没创建草稿/未登录就不让走后续步骤
function Guard({ children }: { children: React.ReactNode }) {
  const { draftUser, user } = useApp();
  return (draftUser || user) ? <>{children}</> : <Navigate to="/role" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* 首页 */}
      <Route path="/" element={<Home />} />

      {/* 向导步骤 */}
      <Route path="/role" element={<RoleSelect />} />
      <Route
        path="/table"
        element={
          <Guard>
            <TableSelect />
          </Guard>
        }
      />
      <Route
        path="/seat"
        element={
          <Guard>
            <SeatSelect />
          </Guard>
        }
      />
      <Route
        path="/status"
        element={
          <Guard>
            <StatusSelect />
          </Guard>
        }
      />
      <Route
        path="/signal"
        element={
          <Guard>
            <SignalSelect />
          </Guard>
        }
      />
      <Route
        path="/final"
        element={
          <Guard>
            <Finalize />
          </Guard>
        }
      />
      <Route
        path="/nearby"
        element={
          <Guard>
            <NearbyTables />
          </Guard>
        }
      />
      
      {/* 兜底重定向 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// src/pages/SeatSelect.tsx
import { useEffect, useMemo,useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

type SeatOcc =
  | null
  | {
      id: string;
      name: string;
      avatar: string; // /avatars/xxx.png
      signals: string[];
    };

export default function SeatSelect() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { tableId?: string } };
  const tableId = state?.tableId ?? null;

  // 娌℃湁 tableId 鍒欓€€鍥?
  useEffect(() => {
    if (!tableId) nav("/table", { replace: true });
  }, [tableId, nav]);

  const [picked, setPicked] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatOcc[] | null>(null); // 闀垮害 6
  const [err, setErr] = useState<string>("");

  // 鍒濇鍔犺浇锛氭嬁鍗犵敤璇︽儏锛堝惈澶村儚锛?
  useEffect(() => {
    if (!tableId) return;
    let aborted = false;
    (async () => {
      try {
        setErr("");
        const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { id: string; seats: SeatOcc[] };
        if (!aborted) setSeats(normalizeSeats(data.seats));
      } catch (e: any) {
        if (!aborted) setErr(e?.message ?? "Load failed");
      }
    })();
    return () => { aborted = true; };
  }, [tableId]);

  // 杞婚噺杞鍗犵敤锛堝彧鎷夊竷灏旀暟缁勶紝鍑忓皯娴侀噺锛?
  useEffect(() => {
    if (!tableId) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/tables/${encodeURIComponent(tableId)}/availability`);
        if (!r.ok) return;
        const data = (await r.json()) as { taken: boolean[] };
        setSeats((prev) => {
          if (!prev || prev.length !== 6) return prev;
          // 浠呮洿鏂板崰鐢ㄥ竷灏旓紝涓嶈鐩栧凡鏈夊ご鍍忎俊鎭紙澶村儚浠呭垵娆″姞杞借幏鍙栵級
          const next = [...prev];
          for (let i = 0; i < 6; i++) {
            const isTaken = !!data.taken[i];
            if (isTaken && next[i] === null) {
              // 鏍囪涓哄尶鍚嶅崰鐢紙濡傛灉涔嬪墠娌″ご鍍忥級
              next[i] = { id: "?", name: "Taken", avatar: "/avatars/white-normal.png", signals: [] };
            }
            if (!isTaken) next[i] = null;
          }
          return next;
        });
      } catch {}
    }, 4000); // 4s 涓€娆?
    return () => clearInterval(t);
  }, [tableId]);

  const ids = useMemo(() => Array.from({ length: 6 }, (_, i) => String(i + 1)), []);
  const leftIds = ids.slice(0, 3);  // "1","2","3"
  const rightIds = ids.slice(3, 6); // "4","5","6"

  const continueNext = () => {
    if (!picked || !tableId) return;
    const idx = Number(picked) - 1;
    if (seats && seats[idx] !== null) {
      alert("This seat is already taken, please choose another.");
      return;
    }
    nav("/status", { state: { tableId, seatId: picked } });
  };

  return (
    <main
      className="
        relative min-h-svh text-white overflow-hidden flex flex-col
        bg-[radial-gradient(62%_70%_at_60%_0%,theme(colors.brand.300/.95),rgba(20,16,24,.92))]
      "
    >
      {/* 鑳屾櫙缁嗙汗 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[.12]
                   bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.4)_0_2px,transparent_2px_6px)]"
      />

      {/* 椤堕儴鍝佺墝涓庢爣棰?*/}
      <header className="px-7 py-6 relative z-10">
        <span className="tracking-wider font-semibold text-lg/none opacity-90">NudgeeQ 路 Admin</span>
      </header>

      <section className="px-4 relative z-10">
        <h2 className="text-center font-display text-[clamp(22px,3.8vw,34px)] opacity-95">Step 2</h2>
        <h1 className="text-center font-display text-[clamp(28px,5vw,48px)]">Select Your Seat</h1>
      </section>

      {/* 妗屽瓙鍗＄墖 */}
      <section className="grow grid place-items-center px-4 pb-24 relative z-10">
        <div
          className="
            w-full max-w-4xl rounded-[24px] p-10
            border border-white/14 bg-white/10 backdrop-blur-xl
            shadow-[0_25px_80px_rgba(0,0,0,.45)] relative
          "
        >
          {/* 閿欒鎬?*/}
          {err && (
            <div className="text-center text-red-200 mb-4">
              Failed to load: {err}
            </div>
          )}

          {/* 涓棿缁嗛暱鐭╁舰妗?+ 澶栦晶搴т綅锛堝厔寮熻妭鐐癸級 */}
          <div className="relative mx-auto w-full max-w-[920px] h-[180px] sm:h-[190px] md:h-[210px]">
            {/* 宸︿晶涓夊骇浣嶏紙鍦ㄧ煩褰㈠渚э級 */}
            <div className="absolute -left-[56px] top-6 bottom-6 flex flex-col items-center justify-center gap-10 sm:gap-12 md:gap-14">
              {leftIds.map((id) => (
                <SeatNode
                  key={id}
                  id={id}
                  occ={seats ? seats[Number(id) - 1] : null}
                  active={picked === id}
                  onPick={() => setPicked(id)}
                />
              ))}
            </div>

            {/* 缁嗛暱鐭╁舰妗岄潰鏈綋锛堝眳涓級 */}
            <div
              className="
                h-full rounded-[16px] bg-white/6 border border-white/20 overflow-visible
                shadow-[inset_0_1px_0_rgba(255,255,255,.25)] relative
              "
            >
              {/* 鍙繚鐣欏眳涓殑 #妗屽彿姘村嵃 */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="font-display text-[56px] md:text-[64px] text-white/12 select-none">
                  #{tableId ?? "?"}
                </span>
              </div>
            </div>

            {/* 鍙充晶涓夊骇浣嶏紙鍦ㄧ煩褰㈠渚э級 */}
            <div className="absolute -right-[56px] top-6 bottom-6 flex flex-col items-center justify-center gap-10 sm:gap-12 md:gap-14">
              {rightIds.map((id) => (
                <SeatNode
                  key={id}
                  id={id}
                  occ={seats ? seats[Number(id) - 1] : null}
                  active={picked === id}
                  onPick={() => setPicked(id)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 -mt-12 grid place-items-center relative z-10">
        <button
          onClick={continueNext}
          disabled={!picked || (seats ? seats[Number(picked) - 1] !== null : false)}
          className="min-w-[180px] rounded-lg px-6 py-2 border border-white/25 bg-white/12 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,.35)] transition hover:bg-white/18 disabled:opacity-40 disabled:hover:bg-white/12 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </section>

      {/* 鍙充笅瑙掕繑鍥?*/}
      <button
        onClick={() => nav(-1)}
        className="
          fixed bottom-5 right-5 z-20 rounded-full
          border border-white/30 bg-white/10 backdrop-blur
          px-4 py-2 text-sm hover:bg-white/15
        "
        aria-label="Back"
      >
        鈫?Back
      </button>
    </main>
  );
}

/* ------- 瀛愮粍浠?------- */

function SeatNode({
  id,
  occ,      // 鍗犵敤涓哄璞★紝绌轰綅涓?null
  active,
  onPick,
}: {
  id: string;
  occ: SeatOcc;
  active: boolean;
  onPick: () => void;
}) {
  const isTaken = !!occ;

  if (isTaken) {
    // 鍗犵敤锛氭樉绀哄ご鍍忥紝涓嶅彲鐐?
    return (
      <div
        title={`${occ?.name ?? "Taken"}`}
        className="z-20 size-[64px] rounded-full overflow-hidden border border-white/40 bg-white/20 shadow-[0_8px_22px_rgba(0,0,0,.35)] grid place-items-center"
        aria-label={`Seat ${id} taken`}
      >
        <img
          src={occ!.avatar}
          alt={occ!.name}
          className="w-[86%] h-[86%] object-contain select-none pointer-events-none"
          draggable={false}
        />
      </div>
    );
  }

  // 绌轰綅锛氬彲閫夋嫨
  return (
    <button
      onClick={onPick}
      className={[
        "z-20 size-[64px] rounded-full grid place-items-center text-lg md:text-xl",
        "border", active ? "border-white/70" : "border-white/30",
        active ? "bg-white/25" : "bg-white/18",
        "backdrop-blur-sm hover:bg-white/24 transition",
        "shadow-[0_8px_20px_rgba(0,0,0,.35)]",
      ].join(" ")}
      aria-pressed={active}
      aria-label={`Seat ${id}`}
      title={`Seat ${id}`}
    >
      {id}
    </button>
  );
}

/* ------- 宸ュ叿 ------- */
function normalizeSeats(a: SeatOcc[] | undefined | null): SeatOcc[] {
  const arr = Array.isArray(a) ? [...a] : [];
  while (arr.length < 6) arr.push(null);
  return arr.slice(0, 6);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWS = setupWS;
const conns = new Map(); // userId -> conn
function setupWS(wss) {
    wss.on("connection", (socket, req) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const userId = url.searchParams.get("userId") ?? "";
        if (!userId) {
            socket.close(1008, "userId required");
            return;
        }
        conns.set(userId, { userId, socket });
        console.log("[ws] connected:", userId);
        socket.on("message", (buf) => {
            try {
                const msg = JSON.parse(String(buf));
                /*
                  支持：
                  {type:"ping"}
                  {type:"direct", to:"peerId", text:"..."}
                */
                if (msg.type === "ping") {
                    socket.send(JSON.stringify({ type: "pong", t: Date.now() }));
                    return;
                }
                if (msg.type === "direct" && msg.to && typeof msg.text === "string") {
                    const peer = conns.get(String(msg.to));
                    const payload = { type: "direct", from: userId, text: msg.text, t: Date.now() };
                    if (peer)
                        peer.socket.send(JSON.stringify(payload));
                    // 回执给发送方
                    socket.send(JSON.stringify({ type: "ack", delivered: !!peer, to: msg.to, t: Date.now() }));
                    return;
                }
            }
            catch { }
        });
        socket.on("close", () => {
            conns.delete(userId);
            console.log("[ws] closed:", userId);
        });
    });
}

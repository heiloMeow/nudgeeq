"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = subscribe;
exports.publish = publish;
const subs = new Map(); // roleId -> set of connections
function subscribe(roleId, res) {
    const s = { res, roleId, alive: true, lastBeat: Date.now() };
    if (!subs.has(roleId))
        subs.set(roleId, new Set());
    subs.get(roleId).add(s);
    // 基本 SSE 头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    // 心跳
    const timer = setInterval(() => {
        if (!s.alive)
            return clearInterval(timer);
        try {
            res.write(`event: ping\ndata: ${Date.now()}\n\n`);
        }
        catch {
            s.alive = false;
            subs.get(roleId)?.delete(s);
            clearInterval(timer);
        }
    }, 15000);
    reqOnClose(res, () => {
        s.alive = false;
        subs.get(roleId)?.delete(s);
        clearInterval(timer);
    });
}
function publish(toRoleId, event, payload) {
    const set = subs.get(toRoleId);
    if (!set || set.size === 0)
        return;
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const s of set) {
        if (!s.alive)
            continue;
        try {
            s.res.write(data);
        }
        catch {
            s.alive = false;
        }
    }
}
function reqOnClose(res, cb) {
    // @ts-ignore
    res.on("close", cb);
}

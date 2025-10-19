"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = subscribe;
exports.publish = publish;
const channels = new Map(); // roleId -> set of subscriptions
function ensureChannel(roleId) {
    let set = channels.get(roleId);
    if (!set) {
        set = new Set();
        channels.set(roleId, set);
    }
    return set;
}
function removeSub(s) {
    const set = channels.get(s.roleId);
    if (set) {
        set.delete(s);
        if (set.size === 0)
            channels.delete(s.roleId);
    }
}
function subscribe(roleId, res) {
    // Basic validation
    if (!roleId) {
        res.status(400).json({ error: "roleId required" });
        return;
    }
    const s = { res, roleId, alive: true, lastBeat: Date.now() };
    ensureChannel(roleId).add(s);
    // Important SSE headers
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform"); // prevent proxies from buffering
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*"); // or rely on app-level CORS
    res.setHeader("X-Accel-Buffering", "no"); // hint for Nginx to disable buffering
    // Flush headers early
    res.flushHeaders?.();
    // Kick the stream so browsers mark it as "open"
    try {
        res.write(`: connected ${Date.now()}\n\n`);
        // Client reconnection backoff (ms)
        res.write(`retry: 10000\n\n`);
    }
    catch {
        s.alive = false;
        removeSub(s);
        return;
    }
    // Heartbeat
    const timer = setInterval(() => {
        if (!s.alive) {
            clearInterval(timer);
            return;
        }
        try {
            res.write(`event: ping\ndata: ${Date.now()}\n\n`);
            s.lastBeat = Date.now();
        }
        catch {
            s.alive = false;
            clearInterval(timer);
            removeSub(s);
        }
    }, 15000);
    // Cleanup on close/finish/error
    const cleanup = () => {
        if (!s.alive)
            return;
        s.alive = false;
        clearInterval(timer);
        removeSub(s);
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    res.on("error", cleanup);
}
function publish(toRoleId, event, payload) {
    const set = channels.get(toRoleId);
    if (!set || set.size === 0)
        return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const s of set) {
        if (!s.alive)
            continue;
        try {
            s.res.write(frame);
        }
        catch {
            s.alive = false;
            removeSub(s);
        }
    }
}

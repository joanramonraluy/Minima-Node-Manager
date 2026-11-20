// Who may talk to the manager. It starts and stops root-owned processes without authentication, so:
//  - it listens on 127.0.0.1 by default (bindHost / NODEMANAGER_BIND to change it);
//  - hostAllowed: the Host header must be localhost, 127.0.0.1 or [::1] (or listed in allowedHosts). This also
//    stops DNS rebinding, where a web page makes its own domain resolve to 127.0.0.1 and then passes the Origin check;
//  - originAllowed: a request with an Origin header (every browser WebSocket handshake and cross-site request)
//    must come from the same host it was sent to. No Origin = curl / scripts / same-origin GET.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(hostHeader) {
    const h = String(hostHeader || '').trim().toLowerCase();
    if (!h) return '';
    if (h.startsWith('[')) { const end = h.indexOf(']'); return end > 0 ? h.slice(0, end + 1) : ''; }
    return h.split(':')[0];
}

function hostAllowed(req, extra = []) {
    const h = hostname(req.headers.host);
    if (!h) return false;
    return LOOPBACK.has(h) || extra.some(x => String(x).trim().toLowerCase() === h);
}

function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

// Where to listen: NODEMANAGER_BIND, then config.bindHost, then loopback only.
function bindHost(config, env = process.env) {
    return (env.NODEMANAGER_BIND || (config && config.bindHost) || '127.0.0.1').trim();
}
const isLoopback = h => h === '127.0.0.1' || h === '::1' || h === 'localhost';

module.exports = { hostAllowed, originAllowed, bindHost, isLoopback, hostname };

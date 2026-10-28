// ==========================================================
// IDEMPOTENCY.JS - stops double submissions
// ----------------------------------------------------------
// Each form sends a random "Idempotency-Key" header, kept until the
// submission succeeds. If the same request arrives twice (double
// click, slow network, retry), the server answers with the FIRST
// result: no second record and no second e-mail.
// ==========================================================

const cache = new Map();          // key -> { pending } or { status, body, expires }
const KEEP_MS = 15 * 60 * 1000;

function idempotent(req, res, next) {
    const key = req.get("Idempotency-Key");
    if (!key || !/^[A-Za-z0-9-]{8,80}$/.test(key)) return next();

    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);   // clean up old ones

    const scoped = `${req.method} ${req.path} ${key}`;
    const hit = cache.get(scoped);
    if (hit && hit.pending) return res.status(409).json({ message: "This form is already being submitted. Please wait a moment." });
    if (hit) return res.status(hit.status).json({ ...hit.body, duplicate: true });

    cache.set(scoped, { pending: true, expires: now + 60 * 1000 });
    const json = res.json.bind(res);
    res.json = body => {
        if (res.statusCode < 400) cache.set(scoped, { status: res.statusCode, body, expires: Date.now() + KEEP_MS });
        else cache.delete(scoped);                     // errors can be fixed and sent again
        return json(body);
    };
    next();
}

module.exports = { idempotent };

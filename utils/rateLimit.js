// utils/rateLimit.js
// Small in-memory limiter (per IP, fixed window). Fine for a single server
// instance. Requires app.set('trust proxy', 1) behind Render/Railway etc.,
// otherwise every visitor shares the proxy's address.
module.exports = function rateLimit({ windowMs, max, message = 'Too many requests, slow down.' }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, h] of hits) if (h.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    let h = hits.get(key);
    if (!h || h.reset <= now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(key, h);
    }
    h.count += 1;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ message });
    }
    next();
  };
};
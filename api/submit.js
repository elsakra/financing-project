/**
 * POST /api/submit — accepts lead + newsletter submissions as JSON.
 *
 * Storage (set one):
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — append to Redis list (recommended; free tier at upstash.com)
 *
 * If Redis is not configured, submissions are JSON.stringify'd to stdout (Vercel Runtime Logs) and the response
 * still returns { ok: true, storage: "log" } so the UI works without extra setup.
 */

const LIST_KEY = "br:submissions:v1";

function getClient() {
  try {
    const { Redis } = require("@upstash/redis");
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 120000) {
        req.destroy();
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function validEmail(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  if (t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (body._hp != null && String(body._hp).trim() !== "") {
    return res.status(200).json({ ok: true });
  }

  const intent = body.intent === "newsletter" ? "newsletter" : "lead";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!validEmail(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }

  if (intent === "lead") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) {
      return res.status(400).json({ error: "Name required" });
    }
  }

  const record = {
    intent,
    name: typeof body.name === "string" ? body.name.trim().slice(0, 200) : "",
    email: email.slice(0, 254),
    phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 80) : "",
    product: typeof body.product === "string" ? body.product.trim().slice(0, 200) : "",
    state: typeof body.state === "string" ? body.state.trim().slice(0, 120) : "",
    loan_amount: typeof body.loan_amount === "string" ? body.loan_amount.trim().slice(0, 120) : "",
    subject: typeof body.subject === "string" ? body.subject.trim().slice(0, 300) : "",
    message: typeof body.message === "string" ? body.message.slice(0, 12000) : "",
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 2000) : "",
    utm: typeof body.utm === "string" ? body.utm.trim().slice(0, 2000) : "",
    at: new Date().toISOString(),
    ip: clientIp(req),
  };

  const redis = getClient();
  if (redis) {
    try {
      await redis.rpush(LIST_KEY, JSON.stringify(record));
      return res.status(200).json({ ok: true, storage: "redis" });
    } catch (e) {
      console.error("[submit] redis error", e && e.message);
      return res.status(503).json({ error: "Storage unavailable" });
    }
  }

  if (process.env.DISABLE_LOG_FALLBACK === "1") {
    return res.status(503).json({ error: "Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN" });
  }

  console.log("[submit]", JSON.stringify(record));
  return res.status(200).json({ ok: true, storage: "log" });
};

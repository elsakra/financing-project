/**
 * POST /api/submit — accepts lead + newsletter submissions as JSON.
 *
 * Storage (set one):
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — append to Redis list (recommended; free tier at upstash.com)
 *
 * If Redis is not configured, submissions are JSON.stringify'd to stdout (Vercel Runtime Logs) and the response
 * still returns { ok: true, storage: "log" } so the UI works without extra setup.
 *
 * Uses Node.js ServerResponse only (writeHead/end) so the same handler runs on Vercel and plain Node (Railway).
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

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (body._hp != null && String(body._hp).trim() !== "") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const intent = body.intent === "newsletter" ? "newsletter" : "lead";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!validEmail(email)) {
    sendJson(res, 400, { error: "Valid email required" });
    return;
  }

  if (intent === "lead") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) {
      sendJson(res, 400, { error: "Name required" });
      return;
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
      sendJson(res, 200, { ok: true, storage: "redis" });
      return;
    } catch (e) {
      console.error("[submit] redis error", e && e.message);
      sendJson(res, 503, { error: "Storage unavailable" });
      return;
    }
  }

  if (process.env.DISABLE_LOG_FALLBACK === "1") {
    sendJson(res, 503, { error: "Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN" });
    return;
  }

  console.log("[submit]", JSON.stringify(record));
  sendJson(res, 200, { ok: true, storage: "log" });
};

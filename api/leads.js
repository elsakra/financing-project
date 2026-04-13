/**
 * GET /api/leads — export stored submissions as JSON (Redis only).
 *
 *   Authorization: Bearer <LEADS_ADMIN_SECRET>
 *
 * Set LEADS_ADMIN_SECRET in Vercel env. Rotate if leaked.
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

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const secret = process.env.LEADS_ADMIN_SECRET;
  if (!secret || typeof secret !== "string") {
    sendJson(res, 503, { error: "Export not configured (set LEADS_ADMIN_SECRET)" });
    return;
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const redis = getClient();
  if (!redis) {
    sendJson(res, 503, { error: "Redis not configured" });
    return;
  }

  try {
    const raw = await redis.lrange(LIST_KEY, 0, -1);
    const items = (raw || []).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, raw: line };
      }
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ count: items.length, items }));
  } catch (e) {
    console.error("[leads] redis error", e && e.message);
    sendJson(res, 503, { error: "Storage unavailable" });
  }
};

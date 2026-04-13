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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Accept");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.LEADS_ADMIN_SECRET;
  if (!secret || typeof secret !== "string") {
    return res.status(503).json({ error: "Export not configured (set LEADS_ADMIN_SECRET)" });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const redis = getClient();
  if (!redis) {
    return res.status(503).json({ error: "Redis not configured" });
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
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ count: items.length, items });
  } catch (e) {
    console.error("[leads] redis error", e && e.message);
    return res.status(503).json({ error: "Storage unavailable" });
  }
};

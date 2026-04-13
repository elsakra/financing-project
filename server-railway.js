#!/usr/bin/env node
/**
 * Optional long-running server for Railway (or any Node host) that exposes the same
 * handlers as Vercel serverless routes under /api/submit and /api/leads.
 *
 * Set SUBMIT_ENDPOINT on the static site to https://<your-railway-host>/api/submit
 * if the frontend is not served from the same origin as this process.
 *
 *   railway up
 *   railway variables set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
 */

const http = require("http");
const { URL } = require("url");
const submit = require("./api/submit.js");
const leads = require("./api/leads.js");

const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || "localhost";
    const u = new URL(req.url || "/", "http://" + host);
    const path = u.pathname || "/";

    if (path === "/api/submit" || path.startsWith("/api/submit/")) {
      return await submit(req, res);
    }
    if (path === "/api/leads" || path.startsWith("/api/leads/")) {
      return await leads(req, res);
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (e) {
    console.error("[server-railway]", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "Internal error" }));
  }
});

server.listen(port, () => {
  console.log("BuilderRates API listening on port " + port);
});

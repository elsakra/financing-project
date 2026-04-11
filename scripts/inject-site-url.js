#!/usr/bin/env node
/**
 * Runs on Vercel (`npm run build`) and optionally locally.
 *
 * Resolves the public site origin and rewrites crawl files + landing_page.html
 * so canonical URLs, Open Graph, JSON-LD, and sitemap stay aligned.
 *
 * Environment (Vercel / CI):
 *   SITE_URL          — Preferred. Example: https://builderrates.com (no trailing slash)
 *   VERCEL_URL        — Set by Vercel; used as https://VERCEL_URL when SITE_URL unset
 *   FORMSPREE_URL     — Optional; Formspree form endpoint for lead capture
 *   NEWSLETTER_URL    — Optional; POST endpoint for newsletter (e.g. second Formspree form)
 *
 * If neither SITE_URL nor VERCEL_URL is set (local dev), defaults to
 * https://financing-project.vercel.app
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_ORIGIN = "https://financing-project.vercel.app";

function normalizeOrigin(u) {
  if (!u || typeof u !== "string") return "";
  let s = u.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  return s;
}

function resolveOrigin() {
  const explicit = normalizeOrigin(process.env.SITE_URL || "");
  if (explicit) return explicit;
  const vu = (process.env.VERCEL_URL || "").trim();
  if (vu) return normalizeOrigin(vu.indexOf("http") === 0 ? vu : "https://" + vu);
  return DEFAULT_ORIGIN;
}

const origin = resolveOrigin();
const originSlash = origin + "/";

const lpPath = path.join(ROOT, "landing_page.html");
let html = fs.readFileSync(lpPath, "utf8");

html = html.split(DEFAULT_ORIGIN).join(origin);

const formspree = (process.env.FORMSPREE_URL || "").trim();
const newsletter = (process.env.NEWSLETTER_URL || "").trim();
html = html.replace(
  /window\.BUILDERRATES\.formspreeUrl\s*=\s*[^;]+;/,
  "window.BUILDERRATES.formspreeUrl = " + JSON.stringify(formspree) + ";"
);
html = html.replace(
  /window\.BUILDERRATES\.newsletterUrl\s*=\s*[^;]+;/,
  "window.BUILDERRATES.newsletterUrl = " + JSON.stringify(newsletter) + ";"
);

fs.writeFileSync(lpPath, html, "utf8");

fs.writeFileSync(
  path.join(ROOT, "robots.txt"),
  ["User-agent: *", "Allow: /", "", "Sitemap: " + originSlash + "sitemap.xml", ""].join("\n")
);

fs.writeFileSync(
  path.join(ROOT, "sitemap.xml"),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    "    <loc>" + originSlash + "</loc>",
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
    "",
  ].join("\n")
);

const securityPath = path.join(ROOT, ".well-known", "security.txt");
fs.writeFileSync(
  securityPath,
  [
    "Contact: mailto:hello@builderrates.com",
    "Preferred-Languages: en",
    "Canonical: " + origin + "/.well-known/security.txt",
    "",
  ].join("\n")
);

console.log("inject-site-url: origin=" + origin + (formspree ? " formspree=set" : "") + (newsletter ? " newsletter=set" : ""));

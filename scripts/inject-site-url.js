#!/usr/bin/env node
/**
 * Runs on Vercel (`npm run build`) and optionally locally.
 *
 * Resolves the public site origin and rewrites HTML templates + crawl files.
 *
 * Environment (Vercel / CI):
 *   SITE_URL              — Preferred. Example: https://builderrates.com (no trailing slash)
 *   VERCEL_URL            — Set by Vercel; used as https://VERCEL_URL when SITE_URL unset
 *   LEAD_EMAIL            — Public contact email (default hello@builderrates.com)
 *   FORMBOLD_ACTION_URL   — FormBold public form POST URL (default https://formbold.com/s/oJqQe)
 *   GTM_ID                — Optional; Google Tag Manager container id (format GTM-XXXXXXX)
 *
 * If neither SITE_URL nor VERCEL_URL is set (local dev), defaults to
 * https://financing-project.vercel.app
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_ORIGIN = "https://financing-project.vercel.app";
const DEFAULT_EMAIL = "hello@builderrates.com";
/** Default FormBold endpoint (leads + newsletter use same form with intent field). */
const DEFAULT_FORMBOLD_ACTION = "https://formbold.com/s/oJqQe";

/** HTML templates processed in place (same replacements as landing). */
const HTML_TEMPLATES = [
  "landing_page.html",
  "privacy.html",
  "terms.html",
  "cookies.html",
  "about.html",
  "contact.html",
  "disclosures.html",
  "how-we-make-money.html",
  "security.html",
  "careers.html",
];

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

function buildCookieNoticeHtml() {
  return (
    '<div id="br-cookie-banner" class="fixed bottom-0 left-0 right-0 z-[250] border-t border-line bg-white/95 backdrop-blur-sm shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-4 py-3 md:py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]" role="region" aria-label="Cookie notice" hidden>' +
    '<div class="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">' +
    '<p class="text-sm text-zinc-600 leading-snug">' +
    "We use cookies and similar technologies to run and improve this site and (if configured) measure traffic. See our " +
    '<a href="/cookies" class="text-primary font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">Cookie Policy</a>.' +
    "</p>" +
    '<div class="flex items-center gap-2 shrink-0">' +
    '<button type="button" id="br-cookie-dismiss" class="bg-primary text-on-primary px-4 py-2.5 rounded-md text-sm font-semibold min-h-[44px] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Dismiss</button>' +
    "</div></div></div>" +
    "<script>(function(){var k=\"br_cookie_notice_dismissed\";var b=document.getElementById(\"br-cookie-banner\");var btn=document.getElementById(\"br-cookie-dismiss\");if(!b)return;try{if(localStorage.getItem(k)===\"1\")return;}catch(e1){}b.removeAttribute(\"hidden\");function hide(){b.setAttribute(\"hidden\",\"\");try{localStorage.setItem(k,\"1\");}catch(e2){}}btn&&btn.addEventListener(\"click\",hide);})();</script>"
  );
}

function processHtml(html, options) {
  const leadEmail = options.leadEmail;
  const formActionUrl = options.formActionUrl;
  const gtmHead = options.gtmHead;
  const gtmBody = options.gtmBody;

  html = html.split(DEFAULT_ORIGIN).join(options.origin);
  html = html.split(DEFAULT_EMAIL).join(leadEmail);

  html = html.replace(
    /window\.BUILDERRATES\.formActionUrl\s*=\s*[^;]+;/,
    "window.BUILDERRATES.formActionUrl = " + JSON.stringify(formActionUrl) + ";"
  );

  html = html.replace("<!-- br:inject-gtm-head -->", gtmHead || "<!-- br:inject-gtm-head -->");
  html = html.replace("<!-- br:inject-gtm-body -->", gtmBody || "<!-- br:inject-gtm-body -->");
  html = html.replace("<!-- br:cookie-notice -->", buildCookieNoticeHtml());
  return html;
}

const origin = resolveOrigin();
const originSlash = origin + "/";
const leadEmail = (process.env.LEAD_EMAIL || "").trim() || DEFAULT_EMAIL;

const gtmRaw = (process.env.GTM_ID || "").trim();
const gtmValid = /^GTM-[A-Z0-9]+$/i.test(gtmRaw);
if (gtmRaw && !gtmValid) {
  console.warn("inject-site-url: invalid GTM_ID (expected GTM-XXXXXXX), skipping GTM");
}
const gtmId = gtmValid ? gtmRaw : "";

const gtmHead = gtmId
  ? "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" +
    gtmId +
    "');</script>"
  : "";

const gtmBody = gtmId
  ? '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' +
    gtmId +
    '" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>'
  : "";

const formActionUrl = ((process.env.FORMBOLD_ACTION_URL || "").trim() || DEFAULT_FORMBOLD_ACTION);

const procOpts = {
  origin: origin,
  leadEmail: leadEmail,
  formActionUrl: formActionUrl,
  gtmHead: gtmHead,
  gtmBody: gtmBody,
};

for (let i = 0; i < HTML_TEMPLATES.length; i++) {
  const name = HTML_TEMPLATES[i];
  const filePath = path.join(ROOT, name);
  if (!fs.existsSync(filePath)) {
    console.warn("inject-site-url: skip missing file: " + name);
    continue;
  }
  let html = fs.readFileSync(filePath, "utf8");
  html = processHtml(html, procOpts);
  fs.writeFileSync(filePath, html, "utf8");
  if (name === "landing_page.html") {
    fs.writeFileSync(path.join(ROOT, "index.html"), html, "utf8");
  }
}

fs.writeFileSync(
  path.join(ROOT, "robots.txt"),
  ["User-agent: *", "Allow: /", "", "Sitemap: " + originSlash + "sitemap.xml", ""].join("\n")
);

const sitemapUrls = [
  { loc: originSlash, changefreq: "weekly", priority: "1.0" },
  { loc: originSlash + "privacy", changefreq: "monthly", priority: "0.5" },
  { loc: originSlash + "terms", changefreq: "monthly", priority: "0.5" },
  { loc: originSlash + "cookies", changefreq: "monthly", priority: "0.4" },
  { loc: originSlash + "about", changefreq: "monthly", priority: "0.6" },
  { loc: originSlash + "contact", changefreq: "monthly", priority: "0.7" },
  { loc: originSlash + "disclosures", changefreq: "monthly", priority: "0.5" },
  { loc: originSlash + "how-we-make-money", changefreq: "monthly", priority: "0.5" },
  { loc: originSlash + "security", changefreq: "monthly", priority: "0.4" },
  { loc: originSlash + "careers", changefreq: "monthly", priority: "0.3" },
];

const sitemapLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
];
for (let j = 0; j < sitemapUrls.length; j++) {
  const u = sitemapUrls[j];
  sitemapLines.push("  <url>");
  sitemapLines.push("    <loc>" + u.loc + "</loc>");
  sitemapLines.push("    <changefreq>" + u.changefreq + "</changefreq>");
  sitemapLines.push("    <priority>" + u.priority + "</priority>");
  sitemapLines.push("  </url>");
}
sitemapLines.push("</urlset>", "");
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemapLines.join("\n"));

const securityPath = path.join(ROOT, ".well-known", "security.txt");
fs.mkdirSync(path.dirname(securityPath), { recursive: true });
fs.writeFileSync(
  securityPath,
  [
    "Contact: mailto:" + leadEmail,
    "Preferred-Languages: en",
    "Canonical: " + origin + "/.well-known/security.txt",
    "",
  ].join("\n")
);

var log =
  "inject-site-url: origin=" +
  origin +
  (leadEmail !== DEFAULT_EMAIL ? " email=set" : "") +
  " formbold=" +
  (formActionUrl !== DEFAULT_FORMBOLD_ACTION ? "custom" : "default") +
  (gtmId ? " gtm=set" : "");
console.log(log);

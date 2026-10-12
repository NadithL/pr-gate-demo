// PR-Gate hosted dashboard (C4): "Sign in with GitHub" in front of the static assets.
// Every request runs through this Worker first (run_worker_first). Only GitHub users on the allowlist
// (ALLOWED_USERS, comma-separated) get in; the list is re-checked on every request, so removing someone
// takes effect immediately. Missing configuration serves nothing (fail closed).
//
// Configuration:
//   vars    GITHUB_CLIENT_ID, ALLOWED_USERS        (set by publish.sh from the repo's Actions variables)
//   secrets GITHUB_CLIENT_SECRET, SESSION_SECRET   (set once with `wrangler secret put`)
// The OAuth app asks for no scopes: it only learns the user's public login, and its token is discarded.

const SESSION_COOKIE = "pg_session";
const STATE_COOKIE = "pg_oauth";
const SESSION_TTL_S = 12 * 60 * 60;
const STATE_TTL_S = 10 * 60;
const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const now = () => Math.floor(Date.now() / 1000);

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function cookie(name, value, maxAge, path = "/") {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function allowed(env) {
  return new Set((env.ALLOWED_USERS || "").split(",").map((u) => u.trim().toLowerCase()).filter(Boolean));
}

// Only same-site paths may be used as the post-login destination (no open redirect).
function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    && !next.startsWith("/auth/") ? next : "/";
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

// Returns the payload if the signature is valid and it has not expired, else null.
async function verify(token, secret) {
  const [body, sig, extra] = (token || "").split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    // HMAC verification in WebCrypto is constant time.
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(body)))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return typeof payload.exp === "number" && payload.exp > now() ? payload : null;
  } catch {
    return null;
  }
}

function page(status, title, message, link, extraHeaders = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>PR-Gate: ${title}</title>
<style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#1f2328;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}a{color:#58a6ff}}
a.button{display:inline-block;padding:.6rem 1rem;border-radius:6px;background:#1f883d;color:#fff;text-decoration:none}</style>
</head><body><h1>PR-Gate dashboard</h1><p>${message}</p><p>${link}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

const SIGN_IN = '<a class="button" href="/auth/login">Sign in with GitHub</a>';

function login(url, env) {
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const next = safeNext(url.searchParams.get("next"));
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": cookie(STATE_COOKIE, b64url(enc.encode(JSON.stringify({ state, next }))), STATE_TTL_S, "/auth"),
      "Cache-Control": "no-store",
    },
  });
}

async function callback(request, url, env) {
  let saved = null;
  try {
    saved = JSON.parse(new TextDecoder().decode(fromB64url(cookies(request)[STATE_COOKIE] || "")));
  } catch { /* missing or corrupt state cookie */ }
  const code = url.searchParams.get("code");
  if (!saved || !code || saved.state !== url.searchParams.get("state")) {
    return page(400, "Sign-in failed", "The sign-in link expired or was not started here. Please try again.", SIGN_IN);
  }
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "pr-gate-dashboard" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  const token = tokenResp.ok ? (await tokenResp.json()).access_token : null;
  const userResp = token && await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "pr-gate-dashboard" },
  });
  const user = userResp && userResp.ok ? ((await userResp.json()).login || "").toLowerCase() : "";
  const clearState = cookie(STATE_COOKIE, "", 0, "/auth");
  if (!user) {
    return page(502, "Sign-in failed", "GitHub did not confirm who you are. Please try again.", SIGN_IN,
      { "Set-Cookie": clearState });
  }
  if (!allowed(env).has(user)) {
    return page(403, "Access denied", `GitHub user <b>${user}</b> is not on the PR-Gate team list.`,
      '<a href="https://github.com/logout">Switch GitHub account</a>', { "Set-Cookie": clearState });
  }
  const session = await sign({ u: user, exp: now() + SESSION_TTL_S }, env.SESSION_SECRET);
  const headers = new Headers({ Location: safeNext(saved.next), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearState);
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, SESSION_TTL_S));
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env) {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET || allowed(env).size === 0) {
      return new Response("Dashboard sign-in is not configured", { status: 503 });
    }
    const url = new URL(request.url);
    if (url.pathname === "/auth/login") return login(url, env);
    if (url.pathname === "/auth/callback") return callback(request, url, env);
    if (url.pathname === "/auth/logout") {
      return page(200, "Signed out", "You are signed out.", SIGN_IN,
        { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) });
    }

    const session = await verify(cookies(request)[SESSION_COOKIE], env.SESSION_SECRET);
    if (!session || !allowed(env).has(session.u)) {
      const accept = request.headers.get("Accept") || "";
      if (request.method === "GET" && accept.includes("text/html")) {
        const next = encodeURIComponent(url.pathname + url.search);
        return new Response(null, { status: 302, headers: { Location: `/auth/login?next=${next}`, "Cache-Control": "no-store" } });
      }
      return new Response("Sign-in required", { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex");
    return new Response(response.body, { status: response.status, headers });
  },
};

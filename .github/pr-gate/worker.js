// PR-Gate hosted dashboard (C4): a shared-password gate (HTTP Basic auth) in front of the static assets.
// Every request runs through this Worker first (run_worker_first). The password is the Worker secret
// DASHBOARD_PASSWORD, set once in the Cloudflare dashboard; without it nothing is served (fail closed).
// The user name is ignored: the team shares one password.

const REALM = 'Basic realm="PR-Gate dashboard", charset="UTF-8"';

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function passwordMatches(request, expected) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const given = decoded.slice(colon + 1);
  // Compare fixed-length hashes in constant time, so timing reveals nothing about the password.
  return crypto.subtle.timingSafeEqual(await digest(given), await digest(expected));
}

export default {
  async fetch(request, env) {
    if (!env.DASHBOARD_PASSWORD) {
      return new Response("Dashboard password not configured", { status: 503 });
    }
    if (!(await passwordMatches(request, env.DASHBOARD_PASSWORD))) {
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": REALM, "Cache-Control": "no-store" },
      });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex");
    return new Response(response.body, { status: response.status, headers });
  },
};

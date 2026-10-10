const json = (data, status=200, extraHeaders={}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...extraHeaders }
});

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // CLI health checks; API key is still required for data endpoints.
  const configured = String(env.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return local || (configured && origin === configured);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const configured = String(env.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");
  const allowOrigin = origin && (origin === configured || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Portfolio-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!allowedOrigin(request, env)) return json({error:"Origin not allowed. Set ALLOWED_ORIGIN to your GitHub Pages origin."}, 403, cors);
    if (request.method === "OPTIONS") return new Response(null, {status:204, headers:cors});
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ok:true,service:"northstar-portfolio-api"},200,cors);
    if (url.pathname !== "/api/state") return json({error:"Not found"},404,cors);
    if (!["GET","PUT"].includes(request.method)) return json({error:"Method not allowed"},405,{...cors,"Allow":"GET, PUT, OPTIONS"});
    const expected = String(env.APP_ACCESS_KEY || "");
    const supplied = String(request.headers.get("X-Portfolio-Key") || "");
    if (!expected || !supplied || supplied.length !== expected.length || !constantTimeEqual(supplied, expected)) {
      return json({error:"Access key is missing or incorrect."},401,cors);
    }
    if (request.method === "GET") {
      const row = await env.PORTFOLIO_DB.prepare("SELECT data, updated_at FROM portfolio_state WHERE id = 1").first();
      if (!row) return json({state:null,updatedAt:null},200,cors);
      let state;
      try { state = JSON.parse(row.data); } catch { return json({error:"Stored portfolio JSON is invalid."},500,cors); }
      if (state && Object.keys(state).length === 0) state = null;
      return json({state,updatedAt:row.updated_at},200,cors);
    }
    let state;
    try { state = await request.json(); } catch { return json({error:"Request body must be valid JSON."},400,cors); }
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        !Array.isArray(state.assets) || !Array.isArray(state.wallet) || !Array.isArray(state.orders) ||
        !state.settings || typeof state.settings !== "object") {
      return json({error:"Portfolio state has an invalid structure."},400,cors);
    }
    const serialized = JSON.stringify(state);
    if (serialized.length > 400000) return json({error:"Portfolio snapshot is too large (400 KB maximum)."},413,cors);
    const updatedAt = new Date().toISOString();
    await env.PORTFOLIO_DB.prepare(
      "INSERT INTO portfolio_state (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
    ).bind(serialized, updatedAt).run();
    return json({ok:true,updatedAt},200,cors);
  }
};

function constantTimeEqual(a,b) {
  let mismatch = a.length ^ b.length;
  const max = Math.max(a.length,b.length);
  for (let i=0;i<max;i++) mismatch |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return mismatch === 0;
}

function corsHeaders(origin, methods) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": methods || "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function sendJson(res, status, headers, body) {
  res.writeHead(status, { ...headers, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: "Invalid JSON body" };
    }
  }
  return { body: body || {} };
}

function handleOptions(req, res, methods) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin, methods);
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return { handled: true, headers, origin };
  }
  return { handled: false, headers, origin };
}

module.exports = { corsHeaders, sendJson, parseBody, handleOptions };

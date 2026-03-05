/**
 * VELOUR — Netlify Serverless Function API Proxy
 *
 * Required Environment Variables (set in Netlify UI → Site Settings → Environment Variables):
 *   API_KEY     — Your AdultWork API key
 *   API_SECRET  — Your AdultWork API secret
 *   ENVIRONMENT — "sandbox" or "live" (default: "sandbox")
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Environment",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getBaseUrl(requestEnv) {
  const environment = requestEnv || process.env.ENVIRONMENT || "sandbox";
  return environment === "live"
    ? "https://api.adultwork.com/v1"
    : "https://api-sandbox.adultwork.com/v1";
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message, status = 500, details = null) {
  return jsonResponse(
    { error: message, details, timestamp: new Date().toISOString() },
    status
  );
}

function checkCredentials() {
  if (!process.env.API_KEY || !process.env.API_SECRET) {
    throw new Error(
      "API_KEY or API_SECRET not set. " +
      "Netlify UI → Site Settings → Environment Variables → Add."
    );
  }
}

/**
 * Auth headers — single format only per AdultWork docs.
 */
function authHeaders() {
  return {
    "ApiKey":       process.env.API_KEY,
    "ApiSecret":    process.env.API_SECRET,
    "Accept":       "application/json",
    "Content-Type": "application/json",
    "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

async function getFromAdultWork(apiPath, queryParams = {}, requestEnv = null) {
  checkCredentials();

  const baseUrl = getBaseUrl(requestEnv);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  }

  const url = `${baseUrl}${apiPath}${qs.toString() ? `?${qs}` : ""}`;
  console.log(`[VELOUR] → GET ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
    redirect: "manual",
  });

  console.log(`[VELOUR] ← HTTP ${response.status} ${response.headers.get("content-type")} from ${apiPath}`);

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} — Non-JSON from AdultWork. ` +
      `Content-Type: ${contentType}. ` +
      `Preview: ${text.substring(0, 500)}`
    );
  }

  const data = await response.json();
  return { data, status: response.status };
}

// ── Main Handler ─────────────────────────────────────────────────────────

export default async (request, context) => {
  const url = new URL(request.url);

  // Strip the Netlify function prefix to get the clean route
  // e.g. /.netlify/functions/proxy/health → /health
  const path = url.pathname.replace(/^\/.netlify\/functions\/proxy/, "") || "/";

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const requestEnv =
    request.headers.get("X-Environment") ||
    url.searchParams.get("env") ||
    null;

  console.log(`[VELOUR] ${request.method} ${path} | env=${requestEnv || process.env.ENVIRONMENT || "sandbox"}`);

  try {

    // ── Health ────────────────────────────────────────────────────
    if (path === "/health") {
      return jsonResponse({
        status: "ok",
        worker: "velour-netlify",
        environment: requestEnv || process.env.ENVIRONMENT || "sandbox",
        baseUrl: getBaseUrl(requestEnv),
        credentials: {
          api_key:    process.env.API_KEY    ? `✓ set — ${process.env.API_KEY.length} chars, starts "${process.env.API_KEY.substring(0,4)}..."` : "✗ MISSING",
          api_secret: process.env.API_SECRET ? `✓ set — ${process.env.API_SECRET.length} chars, starts "${process.env.API_SECRET.substring(0,4)}..."` : "✗ MISSING",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ── Debug: raw request to AdultWork ───────────────────────────
    if (path === "/debug/raw") {
      checkCredentials();
      const apiPath = url.searchParams.get("path") || "/Lists/GetGenders";
      const baseUrl = getBaseUrl(requestEnv);
      const targetUrl = `${baseUrl}${apiPath}`;

      const response = await fetch(targetUrl, {
        method: "GET",
        headers: authHeaders(),
        redirect: "manual",
      });

      const responseText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      return jsonResponse({
        debug: true,
        request: {
          url: targetUrl,
          method: "GET",
          headers_sent: {
            ApiKey:    process.env.API_KEY    ? `${process.env.API_KEY.substring(0,8)}... (${process.env.API_KEY.length} chars)` : "MISSING",
            ApiSecret: process.env.API_SECRET ? `${process.env.API_SECRET.substring(0,4)}... (${process.env.API_SECRET.length} chars)` : "MISSING",
          },
        },
        response: {
          status:      response.status,
          statusText:  response.statusText,
          contentType: response.headers.get("content-type"),
          headers:     responseHeaders,
          body:        responseText.substring(0, 2000),
        },
      });
    }

    // ── Debug: verify credentials ────────────────────────────────
    if (path === "/debug/verify") {
      checkCredentials();
      const baseUrl = getBaseUrl(requestEnv);
      const targetUrl = `${baseUrl}/Account/VerifyCredentials`;

      const response = await fetch(targetUrl, {
        method: "GET",
        headers: authHeaders(),
        redirect: "manual",
      });

      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();

      return jsonResponse({
        debug: true,
        endpoint: targetUrl,
        status: response.status,
        contentType,
        body: body.substring(0, 2000),
        credentials_look_valid: response.status === 200,
      });
    }

    // ── Lists: Genders ──────────────────────────────────────────
    if (path === "/api/lists/genders") {
      const { data, status } = await getFromAdultWork("/Lists/GetGenders", {}, requestEnv);
      return jsonResponse(data, status);
    }

    // ── Lists: Orientations ─────────────────────────────────────
    if (path === "/api/lists/orientations") {
      const { data, status } = await getFromAdultWork("/Lists/GetOrientations", {}, requestEnv);
      return jsonResponse(data, status);
    }

    // ── Lists: Countries ────────────────────────────────────────
    if (path === "/api/lists/countries") {
      const { data, status } = await getFromAdultWork("/Lists/GetCountries", {}, requestEnv);
      return jsonResponse(data, status);
    }

    // ── Lists: Regions ──────────────────────────────────────────
    if (path === "/api/lists/regions") {
      const countryId = url.searchParams.get("countryId");
      const params    = countryId ? { countryId } : {};
      const { data, status } = await getFromAdultWork("/Lists/GetRegions", params, requestEnv);
      return jsonResponse(data, status);
    }

    // ── Search Profiles ─────────────────────────────────────────
    if (path === "/api/search/profiles") {
      if (request.method !== "POST") {
        return errorResponse("Method not allowed — use POST", 405);
      }

      let body = {};
      try { body = await request.json(); }
      catch { return errorResponse("Invalid or missing JSON body", 400); }

      const params = {};
      if (body.GenderId      != null) params.genderId      = body.GenderId;
      if (body.MinAge        != null) params.minAge        = body.MinAge;
      if (body.MaxAge        != null) params.maxAge        = body.MaxAge;
      if (body.Postcode      != null && body.Postcode !== "") params.postcode = body.Postcode;
      if (body.Radius        != null) params.radius        = body.Radius;
      if (body.OrientationId != null) params.orientationId = body.OrientationId;
      if (body.CountryId     != null) params.countryId     = body.CountryId;
      if (body.RegionId      != null) params.regionId      = body.RegionId;
      params.pageNumber = body.PageNumber ?? 1;
      params.pageSize   = body.PageSize   ?? 20;

      console.log(`[VELOUR] Search params: ${JSON.stringify(params)}`);

      const { data, status } = await getFromAdultWork("/Search/SearchProfiles", params, requestEnv);
      const count = data?.Profiles?.length ?? data?.Results?.length ?? "?";
      console.log(`[VELOUR] Search result: HTTP ${status}, profiles=${count}`);
      return jsonResponse(data, status);
    }

    // ── 404 ─────────────────────────────────────────────────────
    return errorResponse(`Unknown route: ${path}`, 404);

  } catch (err) {
    console.error(`[VELOUR] Error on ${path}: ${err.message}`);
    return errorResponse("Proxy error", 500, err.message);
  }
};

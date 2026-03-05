/**
 * VELOUR — Netlify Serverless API Proxy
 *
 * Environment Variables (set in Netlify Dashboard → Site → Environment Variables):
 *   API_KEY     — Your AdultWork API key
 *   API_SECRET  — Your AdultWork API secret
 *   ENVIRONMENT — "sandbox" or "live" (default: "sandbox")
 *
 * Replaces the Cloudflare Worker proxy. Netlify Functions run on AWS Lambda,
 * which uses different IP ranges and should avoid AdultWork's Cloudflare
 * managed challenge that blocks CF Worker IPs.
 */

// ── Helpers ─────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Environment",
};

function getBaseUrl(requestEnv) {
  const environment = requestEnv || process.env.ENVIRONMENT || "sandbox";
  return environment === "live"
    ? "https://api.adultwork.com/v1"
    : "https://api-sandbox.adultwork.com/v1";
}

function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function errorResponse(message, statusCode = 500, details = null) {
  return jsonResponse(
    { error: message, details, timestamp: new Date().toISOString() },
    statusCode
  );
}

function checkCredentials() {
  if (!process.env.API_KEY || !process.env.API_SECRET) {
    throw new Error(
      "API_KEY or API_SECRET not set. " +
      "Netlify Dashboard → Site → Environment Variables → Add variable."
    );
  }
}

/**
 * Auth headers — single format per AdultWork docs.
 */
function authHeaders() {
  return {
    "X-ApiKey":     process.env.API_KEY,
    "X-ApiSecret":  process.env.API_SECRET,
    "Accept":       "application/json",
    "Content-Type": "application/json",
    "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

/**
 * GET from AdultWork API.
 */
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

/**
 * POST to AdultWork API with JSON body — used for search.
 */
async function postToAdultWork(apiPath, body = {}, requestEnv = null) {
  checkCredentials();

  const baseUrl = getBaseUrl(requestEnv);
  const url = `${baseUrl}${apiPath}`;

  console.log(`[VELOUR] → POST ${url}`);
  console.log(`[VELOUR]   Body: ${JSON.stringify(body)}`);

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
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


// ── Main Handler ────────────────────────────────────────────────────

export const handler = async (event) => {
  const path   = event.path;
  const method = event.httpMethod;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const requestEnv =
    (event.headers["x-environment"]) ||
    (event.queryStringParameters?.env) ||
    null;

  console.log(`[VELOUR] ${method} ${path} | env=${requestEnv || process.env.ENVIRONMENT || "sandbox"}`);

  try {

    // ── Health ──────────────────────────────────────────────────
    if (path === "/health") {
      return jsonResponse({
        status: "ok",
        worker: "velour-netlify",
        environment: requestEnv || process.env.ENVIRONMENT || "sandbox",
        baseUrl: getBaseUrl(requestEnv),
        credentials: {
          api_key:    process.env.API_KEY    ? `✓ set — ${process.env.API_KEY.length} chars, starts "${process.env.API_KEY.substring(0, 4)}..."` : "✗ MISSING",
          api_secret: process.env.API_SECRET ? `✓ set — ${process.env.API_SECRET.length} chars, starts "${process.env.API_SECRET.substring(0, 4)}..."` : "✗ MISSING",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ── Debug: raw request to AdultWork ─────────────────────────
    if (path === "/debug/raw") {
      checkCredentials();
      const apiPath   = event.queryStringParameters?.path || "/Lists/GetGenders";
      const baseUrl   = getBaseUrl(requestEnv);
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
            ApiKey:    process.env.API_KEY    ? `${process.env.API_KEY.substring(0, 8)}... (${process.env.API_KEY.length} chars)` : "MISSING",
            ApiSecret: process.env.API_SECRET ? `${process.env.API_SECRET.substring(0, 4)}... (${process.env.API_SECRET.length} chars)` : "MISSING",
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

    // ── Debug: verify credentials ───────────────────────────────
    if (path === "/debug/verify") {
      checkCredentials();
      const baseUrl   = getBaseUrl(requestEnv);
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

    // ── Debug: test search with minimal params ──────────────────
    // Open in browser: https://velourfunc.netlify.app/debug/search
    if (path === "/debug/search") {
      checkCredentials();

      const testParams = {
        GenderIDs: "2",
        MinAge: 18,
        MaxAge: 99,
        CountryID: 1,
        PageNumber: 1,
        ProfilesPerPage: 5
      };

      try {
        const { data, status } = await getFromAdultWork("/search/searchProfiles", testParams, requestEnv);
        return jsonResponse({
          debug: true,
          test: "Female, 18-99, UK, 5 results",
          request: { params: testParams },
          response: { status, data },
          profileCount: data?.Profiles?.length ?? "N/A",
          totalResults: data?.ProfilesTotal ?? "N/A",
        });
      } catch (err) {
        return jsonResponse({
          debug: true,
          test: "Female, 18-99, UK, 5 results",
          request: { params: testParams },
          error: err.message,
        });
      }
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
      const countryId = event.queryStringParameters?.countryId;
      const params    = countryId ? { CountryID: countryId } : {};
      const { data, status } = await getFromAdultWork("/Lists/GetRegions", params, requestEnv);
      return jsonResponse(data, status);
    }

    // ── Search Profiles ─────────────────────────────────────────
    // Frontend sends POST with JSON body → proxy maps and forwards as GET to AdultWork
    if (path === "/api/search/profiles") {
      if (method !== "POST") {
        return errorResponse("Method not allowed — use POST", 405);
      }

      let body = {};
      try { body = JSON.parse(event.body || "{}"); }
      catch { return errorResponse("Invalid or missing JSON body", 400); }

      // Map frontend field names → exact AdultWork API field names
      const params = {};

      // GenderIDs — comma-separated string per docs
      if (body.GenderId != null)      params.GenderIDs = String(body.GenderId);

      // Age range — integers
      if (body.MinAge != null)        params.MinAge = body.MinAge;
      if (body.MaxAge != null)        params.MaxAge = body.MaxAge;

      // Location: postcode requires radius, radius requires postcode
      if (body.Postcode && body.Postcode !== "") {
        params.LocationZipCode        = body.Postcode;
        params.LocationProximityMiles = body.Radius || 50;  // default 50 miles if not set
      }

      // OrientationIds — comma-separated string per docs
      if (body.OrientationId != null) params.OrientationIds = String(body.OrientationId);

      // CountryID — integer, default to 1 (United Kingdom)
      params.CountryID = body.CountryId != null ? body.CountryId : 1;

      // RegionID — integer
      if (body.RegionId != null)      params.RegionID = body.RegionId;

      // Pagination
      params.PageNumber      = body.PageNumber ?? 1;
      params.ProfilesPerPage = body.PageSize   ?? 50;

      console.log(`[VELOUR] Search params: ${JSON.stringify(params)}`);

      const { data, status } = await getFromAdultWork("/search/searchProfiles", params, requestEnv);
      const count = data?.Profiles?.length ?? "?";
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

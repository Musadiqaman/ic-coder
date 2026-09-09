import crypto from "node:crypto";
import RateLimit from "../models/RateLimit.js";

// Reject Mongo-style operator/dot keys in any user-controlled JSON value.
export function rejectMongoOperators(value, path = "body") {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      rejectMongoOperators(item, `${path}[${i}]`);
    });
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      const err = new Error(`Invalid input field: ${path}.${key}`);
      err.status = 400;
      throw err;
    }

    rejectMongoOperators(value[key], `${path}.${key}`);
  }
}

// Validate JSON structure without limiting individual text-field length.
// This allows large Base64/image data such as student face images.
export function validateJsonComplexity(
  value,
  depth = 0,
  state = { keys: 0 }
) {
  // Prevent extremely deep recursive payloads.
  if (depth > 12) {
    const err = new Error("Request payload is too deeply nested");
    err.status = 400;
    throw err;
  }

  // IMPORTANT:
  // Do NOT limit string length here.
  //
  // Student face/image data can be Base64 encoded and therefore
  // can easily exceed 10,000 characters.
  //
  // Express JSON body size should be controlled separately using
  // express.json({ limit: "..." }).

  if (Array.isArray(value)) {
    if (value.length > 5000) {
      const err = new Error("Too many items in request payload");
      err.status = 400;
      throw err;
    }

    for (const item of value) {
      validateJsonComplexity(item, depth + 1, state);
    }

    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    state.keys += 1;

    if (state.keys > 2000) {
      const err = new Error("Too many fields in request payload");
      err.status = 400;
      throw err;
    }

    validateJsonComplexity(child, depth + 1, state);
  }
}

export function securityHeaders(req, res, next) {
  res.removeHeader("X-Powered-By");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()"
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-DNS-Prefetch-Control", "off");

  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; connect-src 'self' https:; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    );
  }

  next();
}

function makeRateKey(req, keyPrefix, keyFn) {
  if (typeof keyFn === "function") {
    return `${keyPrefix}:${String(keyFn(req)).slice(0, 300)}`;
  }

  return `${keyPrefix}:${req.ip || "unknown"}`;
}

// Mongo-backed rate limiter.
// Works across Vercel/serverless instances because the counter
// is stored in MongoDB instead of process memory.
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = "api",
  keyFn,
} = {}) {
  return async (req, res, next) => {
    const now = Date.now();

    const windowStart =
      Math.floor(now / windowMs) * windowMs;

    const key = makeRateKey(req, keyPrefix, keyFn);

    const expiresAt = new Date(
      windowStart + windowMs + 60_000
    );

    try {
      let doc;

      try {
        doc = await RateLimit.findOneAndUpdate(
          { key, windowStart },
          {
            $inc: { count: 1 },
            $setOnInsert: {
              key,
              windowStart,
              expiresAt,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        ).lean();
      } catch (err) {
        // Handle concurrent upsert race.
        if (err?.code !== 11000) throw err;

        doc = await RateLimit.findOneAndUpdate(
          { key, windowStart },
          { $inc: { count: 1 } },
          { new: true }
        ).lean();
      }

      if ((doc?.count || 0) > max) {
        const retryAfter = Math.max(
          1,
          Math.ceil(
            (windowStart + windowMs - now) / 1000
          )
        );

        res.setHeader("Retry-After", retryAfter);

        return res.status(429).json({
          message:
            "Too many attempts. Please try again later.",
        });
      }

      next();
    } catch (err) {
      console.error(
        "[security] rate limiter unavailable:",
        err.message
      );

      return res.status(503).json({
        message:
          "Security service temporarily unavailable. Please try again.",
      });
    }
  };
}

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;

function signCsrf(payload) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(payload)
    .digest("base64url");
}

export function issueCsrfToken(res) {
  const issuedAt = Date.now().toString();

  const nonce = crypto
    .randomBytes(32)
    .toString("base64url");

  const payload = `${issuedAt}.${nonce}`;

  const token = `${payload}.${signCsrf(payload)}`;

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CSRF_TTL_MS,
    path: "/",
  });

  return token;
}

export function verifyCsrf(req, res, next) {
  // Vercel Cron / server-to-server requests.
  if (req.path.startsWith("/api/internal/cron/")) {
    const auth = req.get("authorization") || "";
    const expected = process.env.CRON_SECRET || "";

    if (
      expected &&
      auth === `Bearer ${expected}`
    ) {
      return next();
    }
  }

  const method = req.method.toUpperCase();

  // CSRF is not required for safe methods.
  if (
    ["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    return next();
  }

  const cookieToken =
    req.cookies?.[CSRF_COOKIE];

  const headerToken =
    req.get(CSRF_HEADER);

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken
  ) {
    return res.status(403).json({
      message: "Invalid CSRF token",
    });
  }

  const parts = cookieToken.split(".");

  if (parts.length !== 3) {
    return res.status(403).json({
      message: "Invalid CSRF token",
    });
  }

  const [
    issuedAt,
    nonce,
    signature,
  ] = parts;

  const timestamp = Number(issuedAt);

  if (
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > CSRF_TTL_MS ||
    Date.now() - timestamp < -60_000
  ) {
    return res.status(403).json({
      message: "CSRF token expired",
    });
  }

  const expected = signCsrf(
    `${issuedAt}.${nonce}`
  );

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return res.status(403).json({
      message: "Invalid CSRF token",
    });
  }

  next();
}
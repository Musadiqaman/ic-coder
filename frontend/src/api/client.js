// Thin fetch wrapper with httpOnly session cookies + double-submit CSRF protection.

const BASE = (
  import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || "http://localhost:5000/api")
    : "/api"
).replace(/\/$/, "");

const CSRF_COOKIE = "csrf_token";

let csrfToken = null;
let csrfPromise = null;

function readCookie(name) {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return match
    ? decodeURIComponent(match.slice(name.length + 1))
    : "";
}

async function ensureCsrf(force = false) {
  if (!force) {
    if (csrfToken) return csrfToken;

    // The CSRF cookie is intentionally readable (double-submit pattern).
    // Reuse it immediately when present instead of making an extra GET.
    const cookieToken = readCookie(CSRF_COOKIE);
    if (cookieToken) {
      csrfToken = cookieToken;
      return csrfToken;
    }
  } else {
    csrfToken = null;
  }

  // Prevent multiple simultaneous CSRF requests.
  if (!csrfPromise) {
    csrfPromise = fetch(`${BASE}/auth/csrf`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to initialize security token");
        }

        const data = await res.json();

        const token = data?.csrfToken || readCookie(CSRF_COOKIE);

        if (!token) {
          throw new Error("CSRF token was not returned by server");
        }

        csrfToken = token;

        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }

  return csrfPromise;
}

async function request(path, options = {}, retryCsrf = true) {
  try {
    const method = String(options.method || "GET").toUpperCase();

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["X-CSRF-Token"] = await ensureCsrf(false);
    }

    const res = await fetch(`${BASE}${path}`, {
      ...options,
      method,
      credentials: "include",
      headers,
    });

    const text = await res.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = {
        message: text || "Invalid server response",
      };
    }

    if (!res.ok) {
      // CSRF cookie/token may have expired.
      // Refresh once and retry the same request.
      if (
        res.status === 403 &&
        data?.message?.toLowerCase().includes("csrf") &&
        retryCsrf &&
        !["GET", "HEAD", "OPTIONS"].includes(method)
      ) {
        await ensureCsrf(true);

        return request(path, options, false);
      }

      const message =
        data?.message || `Request failed (${res.status})`;

      if (
        res.status === 401 &&
        path !== "/auth/me"
      ) {
        window.dispatchEvent(
          new CustomEvent("auth:unauthorized")
        );
      }

      throw new Error(message);
    }

    window.dispatchEvent(
      new CustomEvent("network:online")
    );

    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw err;
    }

    if (
      !navigator.onLine ||
      err instanceof TypeError
    ) {
      window.dispatchEvent(
        new CustomEvent("network:offline")
      );
    }

    throw err;
  }
}

export const api = {
  get: (path, options) =>
    request(path, options),

  post: (path, body) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: (path, body) =>
    request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  del: (path) =>
    request(path, {
      method: "DELETE",
    }),
};

export function resourceClient(resource) {
  return {
    list: () =>
      api.get(`/${resource}`),

    create: (body) =>
      api.post(`/${resource}`, body),

    update: (id, body) =>
      api.put(`/${resource}/${id}`, body),

    remove: (id) =>
      api.del(`/${resource}/${id}`),
  };
}
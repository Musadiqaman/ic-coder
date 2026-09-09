# HISAB — Academy / Software House Management System

Full-stack now: React frontend + Express/MongoDB backend, wired together.
8 modules, sidebar navigation (real routing), light/dark theme, and every page
reads/writes real data through a REST API — no more mock arrays.

## Run karne ka tareeqa

You need **two terminals** (backend + frontend) and a running **MongoDB** instance.

### 1. Backend

```
cd backend
npm install
cp .env.example .env        # edit MONGODB_URI if you're using Atlas instead of local Mongo
Initial admin setup: POST /api/auth/register-admin with X-Admin-Bootstrap-Key (backend env ADMIN_BOOTSTRAP_KEY). The endpoint only works while no admin exists.
npm run dev                 # starts the API on http://localhost:5000
```

MongoDB must be reachable at the `MONGODB_URI` in `.env`. Easiest local option:
install MongoDB Community Server and it'll listen on `mongodb://127.0.0.1:27017` by
default — no extra config needed. Or use a free MongoDB Atlas cluster and paste its
connection string into `.env`.

### 2. Frontend

```
npm install
npm run dev
```

Terminal mein jo link aayega (usually `http://localhost:5173`) browser mein khol lo.
Vite proxies `/api/*` requests to the backend on `:5000` automatically (see
`vite.config.js`), so no CORS setup needed in dev.

## Modules (all wired to real data)

| Page | File | Backend route |
|---|---|---|
| Dashboard | `src/pages/Dashboard.jsx` | `GET /api/dashboard/summary` — real cash-in counter, computed from actual payment records |
| Students | `src/pages/Students.jsx` | `/api/students` |
| Employees | `src/pages/Employees.jsx` | `/api/employees` |
| Teachers | `src/pages/Teachers.jsx` | `/api/teachers` |
| Expenses | `src/pages/Expenses.jsx` | `/api/expenses` |
| Projects | `src/pages/Projects.jsx` | `/api/projects` |
| Loans | `src/pages/Loans.jsx` | `/api/loans` |
| Attendance | `src/pages/Attendance.jsx` | `/api/attendance` — check-ins are real, persisted records with server-side timestamps |

## Structure

- `backend/` — Express + Mongoose API (see `backend/README` notes in this file below)
- `src/theme.jsx` — light/dark color tokens + `useTheme()` hook
- `src/components/Layout.jsx` — shared sidebar + topbar (search, voice command, notifications, theme toggle)
- `src/api/` — frontend API client (`client.js` = fetch wrapper, `resources.js` = per-module clients)
- `src/App.jsx` — routes (HashRouter)
- `src/pages/*.jsx` — one file per module

## Backend structure

```
backend/
  server.js                  # entry point
  src/config/db.js            # Mongo connection
  src/models/                 # Student, Employee, Teacher, Expense, Project, Loan, Attendance, User
  src/controllers/            # CRUD logic (crudFactory.js generates the repetitive parts)
  src/routes/                 # one router per resource
  src/middleware/auth.js      # JWT + bcrypt, built but NOT enforced on routes yet
  src/utils/seed.js           # removed; first admin is created through the one-time bootstrap API
```

## Auth status

`bcryptjs`, `jsonwebtoken`, and `cookie-parser` are wired up — `POST /api/auth/register`,
`POST /api/auth/login`, `POST /api/auth/logout` all work today. **No route is locked down
yet** (matches the "do this later" note in the spec). To enforce it later: import
`requireAuth` from `src/middleware/auth.js` in `server.js` and apply it to whichever
routers should require login, e.g.:

```js
app.use("/api/students", requireAuth, studentRoutes);
```

Role-based access (`requireRole("admin")`, etc.) is in the same file, ready to layer on.

## Status: real backend, still-simulated attendance scan + no voice yet

Everything above is real and persists to MongoDB. Two things called out in the spec are
intentionally **not** done yet, by agreement:

- **Voice control** (Urdu + English, mapped to real actions like "add expense") — not built.
- **Face verification attendance** — the check-in *record* is real (written to Mongo with a
  server timestamp and computed on-time/late status), but the actual face-matching step is
  still a UI simulation. Real face matching needs a reference photo/descriptor per student
  first (the `Student.faceDescriptor` field is reserved for this).
- **"Biometric"** — a browser can't talk to a physical fingerprint sensor. The realistic
  equivalent is **WebAuthn** (same tech as "unlock with Face ID/fingerprint" in a browser),
  which uses the device's own biometric hardware. Not built yet either.

Also not done, per the spec's own "LATER" notes: enforcing auth/roles on routes, and
hardened input sanitization / server security beyond Mongoose's built-in validation.

## Verified so far

- Every backend file syntax-checked and import-tested cleanly.
- Full frontend production build (`npm run build`) passes with no errors.
- **Not yet run end-to-end against a live MongoDB** (no Mongo available in the environment
  this was built in) — test that locally before relying on it.



## Separate Vercel deployment

Deploy `frontend/` and `backend/` as two separate Vercel projects. Set frontend `VITE_API_URL` to the full backend `/api` URL. Set backend `CLIENT_ORIGIN` to the exact frontend origin. Production auth uses HttpOnly + Secure + SameSite=None cookies with CORS credentials, and the frontend sends `credentials: include`. Do not use a frontend API rewrite to the backend domain.

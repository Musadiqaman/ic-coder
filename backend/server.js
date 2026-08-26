import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import cron from "node-cron";

import { connectDB } from "./src/config/db.js";
import { notFound, errorHandler } from "./src/middleware/errorHandler.js";
import { requireAuth, requireRole } from "./src/middleware/auth.js";
import { securityHeaders, rejectMongoOperators, validateJsonComplexity, verifyCsrf } from "./src/middleware/security.js";

import authRoutes from "./src/routes/auth.js";
import studentRoutes from "./src/routes/students.js";
import employeeRoutes from "./src/routes/employees.js";
import teacherRoutes from "./src/routes/teachers.js";
import expenseRoutes from "./src/routes/expenses.js";
import projectRoutes from "./src/routes/projects.js";
import loanRoutes from "./src/routes/loans.js";
import attendanceRoutes from "./src/routes/attendance.js";
import attendanceScheduleRoutes from "./src/routes/attendanceSchedule.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import batchRoutes from "./src/routes/batches.js";
import settingsRoutes from "./src/routes/settings.js";

import { runAutoAttendance, generateMonthlyChallans } from "./src/controllers/studentsController.js";

const app = express();
app.set("trust proxy", 1);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === "change_this_to_a_long_random_string") {
  const message = "JWT_SECRET must be set to a random value of at least 32 characters.";
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`[security] ${message}`);
}


const allowedOrigins = String(process.env.CLIENT_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin)) return cb(null, true); return cb(new Error("CORS origin not allowed")); }, credentials: true }));
app.use(securityHeaders);
app.use(express.json({ limit: "10mb", strict: true }));
app.use(cookieParser());
app.use((req, res, next) => { try { validateJsonComplexity(req.body); rejectMongoOperators(req.body); next(); } catch (err) { next(err); } });
app.use(verifyCsrf);

// Vercel Cron endpoints use a server-only secret instead of browser CSRF tokens.
app.post("/api/internal/cron/auto-attendance", async (req, res, next) => {
  try {
    const auth = req.get("authorization") || "";
    const expected = process.env.CRON_SECRET || "";
    if (!expected || auth !== `Bearer ${expected}`) return res.status(401).json({ message: "Unauthorized" });
    const result = await runAutoAttendance();
    return res.json({ ok: true, date: result.date, students: result.students, teachers: result.teachers });
  } catch (err) { next(err); }
});

app.post("/api/internal/cron/monthly-challans", async (req, res, next) => {
  try {
    const auth = req.get("authorization") || "";
    const expected = process.env.CRON_SECRET || "";
    if (!expected || auth !== `Bearer ${expected}`) return res.status(401).json({ message: "Unauthorized" });
    const created = await generateMonthlyChallans();
    return res.json({ ok: true, created });
  } catch (err) { next(err); }
});
app.use(morgan("dev"));

let dbPromise;
function ensureDb() {
  if (!dbPromise) dbPromise = connectDB();
  return dbPromise;
}
app.use(async (req, res, next) => {
  try { await ensureDb(); next(); } catch (err) { next(err); }
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Login/logout are public. Account registration is protected inside authRoutes
// and is restricted to administrators. Every business module below requires
// an authenticated session, with admin/teacher role checks per module.
app.use("/api/auth", authRoutes);

// Settings is authenticated for both roles; only administrators can create accounts there.
app.use("/api/settings", requireAuth, settingsRoutes);

app.use("/api/students", requireAuth, studentRoutes);
app.use("/api/employees", requireAuth, requireRole("admin"), employeeRoutes);
app.use("/api/teachers", requireAuth, teacherRoutes);
app.use("/api/expenses", requireAuth, requireRole("admin"), expenseRoutes);
app.use("/api/projects", requireAuth, requireRole("admin"), projectRoutes);
app.use("/api/loans", requireAuth, requireRole("admin"), loanRoutes);
app.use("/api/attendance", requireAuth, requireRole("admin", "teacher"), attendanceRoutes);
app.use("/api/attendance-schedule", requireAuth, requireRole("admin"), attendanceScheduleRoutes);
app.use("/api/dashboard", requireAuth, requireRole("admin"), dashboardRoutes);
app.use("/api/batches", requireAuth, requireRole("admin"), batchRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Vercel imports this module as a serverless handler. Local development still
// runs the Express server normally. Scheduled jobs are handled by Vercel Cron
// endpoints above, so node-cron is not used in production/serverless.
if (!process.env.VERCEL) {
  ensureDb().then(() => {
    app.listen(PORT, () => console.log(`[server] running on http://localhost:${PORT}`));
    cron.schedule("55 23 * * *", async () => {
      try {
        const result = await runAutoAttendance();
        console.log(`[cron] auto-attendance for ${result.date}: ${result.students.leaveCount + result.teachers.leaveCount} leave, ${result.students.absentCount + result.teachers.absentCount} absent`);
      } catch (err) { console.error("[cron] auto-attendance failed:", err.message); }
    }, { timezone: "Asia/Karachi" });
    cron.schedule("5 0 1 * *", async () => {
      try {
        const created = await generateMonthlyChallans();
        console.log(`[cron] monthly challans generated (${created} created)`);
      } catch (err) { console.error("[cron] monthly challans failed:", err.message); }
    }, { timezone: "Asia/Karachi" });
  });
}

export default app;

import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { issueCsrfToken } from "../middleware/security.js";
import { audit } from "../utils/audit.js";

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, name: user.name, sessionVersion: user.sessionVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
const isProd = process.env.NODE_ENV === "production";

const cookieOpts = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  maxAge: 12 * 60 * 60 * 1000,
  path: "/",
};

export const csrf = asyncHandler(async (req, res) => {
  const token = issueCsrfToken(res);
  res.json({ csrfToken: token });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const normalizedRole = role || "admin";
  if (!name || !email || !password) return res.status(400).json({ message: "name, email and password are required" });
  if (String(name).trim().length < 2 || String(name).trim().length > 80) return res.status(400).json({ message: "Name must be 2-80 characters" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ message: "Enter a valid email address" });
  if (String(password).length < 8 || String(password).length > 128) return res.status(400).json({ message: "Password must be 8-128 characters" });
  if (normalizedRole !== "admin") return res.status(400).json({ message: "Settings can only create administrator accounts. Create teachers from the Teachers module." });
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) return res.status(409).json({ message: "Email already registered" });

  const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password, role: "admin" });
  await audit(req, "admin.account_created", { createdUserId: String(user._id), role: "admin" });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, teacherId: user.teacherId || null });
});

export const createAdminFromEnv = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const suppliedKey = String(req.query?.key || "").trim();
  const configuredKey = String(process.env.ADMIN_BOOTSTRAP_KEY || "").trim();
  if (!configuredKey || configuredKey.length < 32) {
    return res.status(503).json({ message: "Initial admin setup is not configured." });
  }
  if (!suppliedKey || suppliedKey.length !== configuredKey.length || !crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(configuredKey))) {
    return res.status(403).json({ message: "Invalid setup key." });
  }

  const adminExists = await User.exists({ role: "admin" });
  if (adminExists) {
    return res.status(409).json({ message: "An administrator already exists. This bootstrap endpoint is locked." });
  }

  const name = String(process.env.ADMIN_NAME || "").trim();
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const role = String(process.env.ADMIN_ROLE || "admin").trim().toLowerCase();

  if (name.length < 2 || name.length > 80) return res.status(500).json({ message: "ADMIN_NAME must be 2-80 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(500).json({ message: "ADMIN_EMAIL is invalid." });
  if (password.length < 8 || password.length > 128) return res.status(500).json({ message: "ADMIN_PASSWORD must be 8-128 characters." });
  if (role !== "admin") return res.status(500).json({ message: "ADMIN_ROLE must be admin." });
  if (await User.exists({ email })) return res.status(409).json({ message: "ADMIN_EMAIL is already registered." });

  const user = await User.create({ name, email, password, role });
  await audit(req, "admin.bootstrap_created", { createdUserId: String(user._id), role: user.role, source: "env" });

  return res.status(201).json({
    message: "Administrator created successfully. Remove/comment this bootstrap route and unset the bootstrap credentials after first use.",
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

export const registerFirstAdmin = asyncHandler(async (req, res) => {
  const bootstrapKey = String(req.get("X-Admin-Bootstrap-Key") || req.body?.key || "").trim();
  const configuredKey = String(process.env.ADMIN_BOOTSTRAP_KEY || "").trim();
  if (!configuredKey || configuredKey.length < 32) {
    return res.status(503).json({ message: "Initial admin setup is not configured." });
  }
  if (!bootstrapKey || bootstrapKey.length > 256 || bootstrapKey.length !== configuredKey.length || !crypto.timingSafeEqual(Buffer.from(bootstrapKey), Buffer.from(configuredKey))) {
    return res.status(403).json({ message: "Invalid setup key." });
  }

  const adminExists = await User.exists({ role: "admin" });
  if (adminExists) return res.status(409).json({ message: "An administrator already exists. Use the normal account creation flow." });

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").toLowerCase().trim();
  const password = String(req.body?.password || "");
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Name must be 2-80 characters" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address" });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ message: "Password must be 8-128 characters" });
  if (await User.exists({ email })) return res.status(409).json({ message: "Email already registered" });

  const user = await User.create({ name, email, password, role: "admin" });
  await audit(req, "admin.bootstrap_created", { createdUserId: String(user._id), role: "admin" });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
});

export const login = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const password = String(req.body?.password || "");
  if (!email || !password || email.length > 254 || password.length > 128) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const token = signToken(user);
  res.cookie("token", token, cookieOpts);
  issueCsrfToken(res);
  await audit(req, "auth.login", { userId: String(user._id), role: user.role });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role, teacherId: user.teacherId || null });
});

export const logout = asyncHandler(async (req, res) => {
  if (req.user) await audit(req, "auth.logout", { userId: String(req.user.id) });
  res.clearCookie("token", { httpOnly: true, sameSite: isProd ? "none" : "lax", secure: isProd, path: "/" });
  res.clearCookie("csrf_token", { httpOnly: false, sameSite: isProd ? "none" : "lax", secure: isProd, path: "/" });
  res.json({ message: "Logged out" });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: "User no longer exists" });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role, teacherId: user.teacherId || null });
});

import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Not authenticated" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("role name email teacherId sessionVersion").lean();
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    if ((payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
    req.user = { id: user._id, role: user.role, name: user.name, email: user.email, teacherId: user.teacherId || null };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export function adminOrTeacher(req, res, next) { return requireRole("admin", "teacher")(req, res, next); }

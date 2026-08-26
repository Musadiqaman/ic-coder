import AuditLog from "../models/AuditLog.js";

export async function audit(req, action, metadata = {}) {
  try {
    await AuditLog.create({
      action,
      actorId: req.user?.id || undefined,
      actorRole: req.user?.role || "system",
      ip: req.ip,
      userAgent: String(req.get("user-agent") || "").slice(0, 500),
      metadata,
    });
  } catch (err) {
    // Security logging must never make a legitimate business request fail.
    console.error("[audit] failed:", err.message);
  }
}

import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";

const router = Router();
router.get("/csrf", authController.csrf);
router.get("/create-admin", createRateLimiter({ max: 3, windowMs: 15 * 60 * 1000, keyPrefix: "bootstrap-env-ip" }), authController.createAdminFromEnv);
router.post("/register-admin", createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, keyPrefix: "bootstrap-ip" }), authController.registerFirstAdmin);
router.post("/login", createRateLimiter({ max: 12, keyPrefix: "login-ip" }), createRateLimiter({ max: 6, keyPrefix: "login-account", keyFn: (req) => String(req.body?.email || "").trim().toLowerCase() || "unknown" }), authController.login);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.me);
router.post("/register", requireAuth, requireRole("admin"), createRateLimiter({ max: 12, keyPrefix: "register-ip" }), authController.register);

export default router;

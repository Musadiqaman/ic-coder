import express from "express";
import * as settingsController from "../controllers/settingsController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";

const router = express.Router();
router.use(requireAuth);
router.post("/change-password", createRateLimiter({ max: 5, keyPrefix: "password-change" }), settingsController.changePassword);

export default router;

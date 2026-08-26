import { Router } from "express";
import * as teachersController from "../controllers/teachersController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// Teacher self-service endpoints must come before /:id
router.get("/recognition", requireRole("admin", "teacher"), teachersController.recognitionList);

router.get("/me", teachersController.getMe);
router.get("/me/attendance", teachersController.getMeAttendance);
router.post("/me/attendance", teachersController.markMeAttendance);

// CRUD
router.get("/", requireRole("admin", "teacher"), teachersController.list);
router.get("/:id", requireRole("admin", "teacher"), teachersController.getOne);
router.post("/", requireRole("admin"), teachersController.create);
router.put("/:id", requireRole("admin"), teachersController.update);
router.delete("/:id", requireRole("admin"), teachersController.remove);

// Salary Challans
router.post("/:id/challans", requireRole("admin"), teachersController.generateSalaryChallan);
router.delete("/:id/challans/:challanId", requireRole("admin"), teachersController.removeChallan);

// Payments
router.post("/:id/payments", requireRole("admin"), teachersController.addPayment);
router.delete("/:id/payments/:paymentId", requireRole("admin"), teachersController.removePayment);

// Leave Management
router.post("/:id/leave", requireRole("admin"), teachersController.addLeave);
router.delete("/:id/leave/:leaveId", requireRole("admin"), teachersController.removeLeave);

// Attendance
router.get("/:id/attendance", requireRole("admin", "teacher"), teachersController.getAttendanceHistory);
router.post("/:id/attendance/manual", requireRole("admin"), teachersController.markManualAttendance);

export default router;

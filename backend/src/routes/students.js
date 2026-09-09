import { Router } from "express";
import * as studentsController from "../controllers/studentsController.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", studentsController.list);
router.get("/:id", studentsController.getOne);
router.post("/", requireRole("admin"), studentsController.create);
router.put("/:id", requireRole("admin"), studentsController.update);
router.delete("/:id", requireRole("admin"), studentsController.remove);

router.post("/:id/payments", requireRole("admin"), studentsController.addPayment);
router.delete("/:id/payments/:paymentId", requireRole("admin"), studentsController.removePayment);

// Manually generate a single fee challan for one student (e.g. a one-off
// charge, or raising this month's challan ahead of the automatic job).
router.post("/:id/challans", requireRole("admin"), studentsController.addChallan);

// Delete a single fee challan (blocked server-side if payments already
// exist against it — see removeChallan in the controller).
router.delete("/:id/challans/:challanId", requireRole("admin"), studentsController.removeChallan);

router.post("/:id/attendance", requireRole("admin", "teacher"), studentsController.markAttendance);
router.post("/run-auto-attendance", requireRole("admin"), studentsController.runAutoAttendanceNow);

// Manual trigger for challan generation (the cron job in server.js calls the
// same underlying function automatically on the 1st of every month).
router.post("/generate-challans", requireRole("admin"), studentsController.generateChallansNow);

export default router;
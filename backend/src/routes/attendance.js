import { Router } from "express";
import * as attendanceController from "../controllers/attendanceController.js";

const router = Router();
router.get("/", attendanceController.list);
router.post("/checkin", attendanceController.checkIn);
router.delete("/:id", attendanceController.remove);

export default router;

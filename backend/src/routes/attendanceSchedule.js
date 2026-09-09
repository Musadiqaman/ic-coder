import { Router } from "express";
import * as scheduleController from "../controllers/attendanceScheduleController.js";

const router = Router();

router.get("/", scheduleController.getAllSchedules);
router.get("/:courseType", scheduleController.getSchedule);
router.put("/:courseType", scheduleController.updateSchedule);
router.post("/:courseType/holidays", scheduleController.addHoliday);
router.delete("/:courseType/holidays/:holidayId", scheduleController.deleteHoliday);

export default router;
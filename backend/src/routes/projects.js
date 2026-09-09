import { Router } from "express";
import * as projectsController from "../controllers/projectsController.js";

const router = Router();

router.get("/", projectsController.list);
router.get("/:id", projectsController.getOne);
router.post("/", projectsController.create);
router.put("/:id", projectsController.update);
router.delete("/:id", projectsController.remove);

router.post("/:id/payments", projectsController.addPayment);
router.delete("/:id/payments/:paymentId", projectsController.removePayment);

// Maintenance Challans
router.post("/:id/maintenance-challans", projectsController.generateMaintenanceChallan);
router.delete("/:id/maintenance-challans/:challanId", projectsController.removeMaintenanceChallan);

export default router;

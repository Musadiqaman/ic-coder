import { Router } from "express";
import * as employeesController from "../controllers/employeesController.js";

const router = Router();

// CRUD
router.get("/", employeesController.list);
router.get("/:id", employeesController.getOne);
router.post("/", employeesController.create);
router.put("/:id", employeesController.update);
router.delete("/:id", employeesController.remove);

// Salary Challans
router.post("/:id/challans", employeesController.generateSalaryChallan);
router.delete("/:id/challans/:challanId", employeesController.removeChallan);

// Payments
router.post("/:id/payments", employeesController.addPayment);
router.delete("/:id/payments/:paymentId", employeesController.removePayment);

export default router;
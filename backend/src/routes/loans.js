import { Router } from "express";
import * as loansController from "../controllers/loansController.js";

const router = Router();

router.get("/", loansController.list);
router.get("/:id", loansController.getOne);
router.post("/", loansController.create);
router.put("/:id", loansController.update);
router.delete("/:id", loansController.remove);

router.post("/:id/payments", loansController.addPayment);
router.delete("/:id/payments/:paymentId", loansController.removePayment);

export default router;

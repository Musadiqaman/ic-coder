import { Router } from "express";
import * as expensesController from "../controllers/expensesController.js";

const router = Router();

router.get("/", expensesController.list);
router.get("/:id", expensesController.getOne);
router.post("/", expensesController.create);
router.put("/:id", expensesController.update);
router.delete("/:id", expensesController.remove);

export default router;

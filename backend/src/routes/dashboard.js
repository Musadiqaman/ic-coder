import { Router } from "express";
import { summary } from "../controllers/dashboardController.js";

const router = Router();
router.get("/summary", summary);

export default router;

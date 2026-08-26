import express from "express";
import { list, create, update, remove } from "../controllers/batchController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireRole("admin", "teacher"), list);
router.post("/", requireRole("admin"), create);
router.put("/:id", requireRole("admin"), update);
router.delete("/:id", requireRole("admin"), remove);

export default router;

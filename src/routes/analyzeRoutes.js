import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import * as analyzeController from "../controllers/analyzeController.js";

const router = Router();

router.use(authMiddleware);

router.post("/", analyzeController.analyze);
router.get("/:resumeId", analyzeController.getByResume);

export default router;

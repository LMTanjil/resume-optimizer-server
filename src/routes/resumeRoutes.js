import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import * as resumeController from "../controllers/resumeController.js";

const router = Router();

router.use(authMiddleware);

router.get("/", resumeController.getAll);
router.post("/", resumeController.create);
router.get("/:id", resumeController.getById);
router.put("/:id", resumeController.update);
router.delete("/:id", resumeController.remove);

export default router;

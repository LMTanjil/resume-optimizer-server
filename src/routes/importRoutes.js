import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { upload } from "../services/importService.js";
import * as importController from "../controllers/importController.js";

const router = Router();

router.use(authMiddleware);

router.post("/import", upload.single("file"), importController.importResume);

export default router;

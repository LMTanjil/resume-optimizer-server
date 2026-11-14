import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import analyzeRoutes from "./routes/analyzeRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/analyze", analyzeRoutes);
app.use("/api/resume", importRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

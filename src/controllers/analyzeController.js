import * as analyzeService from "../services/analyzeService.js";

export const analyze = async (req, res, next) => {
  try {
    const { resumeId, jobDescription } = req.body ?? {};
    const result = await analyzeService.analyze(req.user.id, resumeId, jobDescription);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getByResume = async (req, res, next) => {
  try {
    const analyses = await analyzeService.getByResume(req.user.id, req.params.resumeId);
    res.status(200).json(analyses);
  } catch (err) {
    next(err);
  }
};

import * as importService from "../services/importService.js";

export const importResume = async (req, res, next) => {
  try {
    const result = await importService.importResume(req.file);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

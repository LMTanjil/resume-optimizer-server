import * as resumeService from "../services/resumeService.js";

export const getAll = async (req, res, next) => {
  try {
    const resumes = await resumeService.getAll(req.user.id);
    res.status(200).json(resumes);
  } catch (err) {
    next(err);
  }
};

export const getById = async (req, res, next) => {
  try {
    const resume = await resumeService.getById(req.user.id, req.params.id);
    res.status(200).json(resume);
  } catch (err) {
    next(err);
  }
};

export const create = async (req, res, next) => {
  try {
    const { title, content } = req.body ?? {};
    const resume = await resumeService.create(req.user.id, title, content);
    res.status(201).json(resume);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const { title, content } = req.body ?? {};
    const resume = await resumeService.update(req.user.id, req.params.id, title, content);
    res.status(200).json(resume);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    const result = await resumeService.remove(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

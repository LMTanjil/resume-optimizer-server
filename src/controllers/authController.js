import * as authService from "../services/authService.js";

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};
    const result = await authService.register(email, password, name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

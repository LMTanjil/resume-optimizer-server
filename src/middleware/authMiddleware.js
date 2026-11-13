import jwt from "jsonwebtoken";
import { unauthorized } from "../utils/httpError.js";

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(unauthorized("Missing or malformed Authorization header"));
  }

  const token = header.slice(7).trim();
  if (!token) {
    return next(unauthorized("Missing token"));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    return next();
  } catch {
    return next(unauthorized("Invalid or expired token"));
  }
};

export default authMiddleware;

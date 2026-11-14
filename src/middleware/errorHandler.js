import { HttpError } from "../utils/httpError.js";

export const notFound = (req, res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = 500;
  let message = "Internal server error";

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON in request body";
  } else if (err.type === "entity.too.large") {
    status = 400;
    message = "Request body too large";
  } else if (err.name === "MulterError") {
    status = 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large. Maximum size is 5MB"
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file field. Use the field name 'file'"
          : err.message;
  } else if (err.code === "23505") {
    status = 400;
    message = "Resource already exists";
  } else if (err.code === "22P02") {
    status = 400;
    message = "Invalid input";
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};

import pool from "../config/db.js";

export const findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
};

export const create = async (email, password_hash) => {
  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
    [email, password_hash]
  );
  return result.rows[0];
};

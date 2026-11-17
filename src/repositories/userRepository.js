import pool from "../config/db.js";

export const findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
};

export const create = async (email, password_hash, name) => {
  const result = await pool.query(
    "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
    [email, password_hash, name]
  );
  return result.rows[0];
};

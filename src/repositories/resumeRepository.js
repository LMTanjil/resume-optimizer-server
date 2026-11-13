import pool from "../config/db.js";

export const findAllByUser = async (userId) => {
  const result = await pool.query(
    `SELECT id, user_id, title, content, created_at, updated_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows;
};

export const findByIdAndUser = async (id, userId) => {
  const result = await pool.query(
    `SELECT id, user_id, title, content, created_at, updated_at
     FROM resumes
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0];
};

export const create = async (userId, title, content) => {
  const result = await pool.query(
    `INSERT INTO resumes (user_id, title, content)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, title, content, created_at, updated_at`,
    [userId, title, JSON.stringify(content)]
  );
  return result.rows[0];
};

export const update = async (id, userId, title, content) => {
  const result = await pool.query(
    `UPDATE resumes
     SET title = $3, content = $4, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, title, content, created_at, updated_at`,
    [id, userId, title, JSON.stringify(content)]
  );
  return result.rows[0];
};

export const remove = async (id, userId) => {
  const result = await pool.query(
    "DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING id",
    [id, userId]
  );
  return result.rows[0];
};

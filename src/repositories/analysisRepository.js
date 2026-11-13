import pool from "../config/db.js";

export const create = async (resumeId, jobDescription, aiResponse, matchScore) => {
  const result = await pool.query(
    `INSERT INTO analyses (resume_id, job_description, ai_response, match_score)
     VALUES ($1, $2, $3, $4)
     RETURNING id, resume_id, job_description, ai_response, match_score, created_at`,
    [resumeId, jobDescription, JSON.stringify(aiResponse), matchScore]
  );
  return result.rows[0];
};

export const findAllByResume = async (resumeId) => {
  const result = await pool.query(
    `SELECT id, resume_id, job_description, ai_response, match_score, created_at
     FROM analyses
     WHERE resume_id = $1
     ORDER BY created_at DESC`,
    [resumeId]
  );
  return result.rows;
};

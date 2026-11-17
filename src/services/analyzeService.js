import OpenAI from "openai";
import * as resumeRepository from "../repositories/resumeRepository.js";
import * as analysisRepository from "../repositories/analysisRepository.js";
import { badRequest, notFoundError, serverError } from "../utils/httpError.js";
import { parseId } from "./resumeService.js";

// Shared Groq client and model — also used by importService.js
export const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export const MODEL = "openai/gpt-oss-120b";
const MAX_JOB_DESCRIPTION_LENGTH = 20000;

const SYSTEM_PROMPT = `You are an expert resume analyzer. Your job is to carefully compare a resume against a job description and return a detailed analysis.

Return ONLY a valid JSON object. No markdown, no backticks, no extra text before or after.

Rules:
- match_score: a number 0-100 representing how well the resume matches the job description
- missing_keywords: list EVERY skill, tool, technology, or qualification mentioned in the job description that is NOT present in the resume. Be thorough — if the job asks for SQL and the resume has no SQL, include it.
- strengths: list specific skills, experiences, or qualifications from the resume that directly match what the job description asks for. Never return an empty array if there is any match.
- suggestions: give 3 to 5 specific, actionable suggestions for improving the resume for this specific job. Each suggestion must be a complete sentence. Never return an empty array.

The JSON must follow this exact structure:
{
  "match_score": <number 0-100>,
  "missing_keywords": [<string>],
  "suggestions": [<string>],
  "strengths": [<string>]
}`;

const buildUserPrompt = (resumeContent, jobDescription) =>
  `Resume: ${JSON.stringify(resumeContent)}

Job Description: ${jobDescription}`;

// Without JSON mode the model can occasionally wrap its output in ```json
// fences or add stray text, so isolate the outermost {...} before parsing.
const extractJson = (text) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
};

const toStringArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

// Coerces the model output into the exact shape the API promises.
const normalizeAiResult = (raw) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw serverError("AI response was not a JSON object");
  }

  const score = Number(raw.match_score);
  if (raw.match_score === null || raw.match_score === "" || !Number.isFinite(score)) {
    throw serverError("AI response is missing a valid match_score");
  }

  return {
    match_score: Math.min(100, Math.max(0, Math.round(score))),
    missing_keywords: toStringArray(raw.missing_keywords),
    suggestions: toStringArray(raw.suggestions),
    strengths: toStringArray(raw.strengths),
  };
};

const callGroq = async (systemPrompt, userPrompt) => {
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });
  } catch (err) {
    console.error("Groq API error:", err?.message ?? err);
    throw serverError("Failed to get a response from the AI service");
  }

  const text = completion.choices?.[0]?.message?.content;
  if (!text) {
    throw serverError("AI service returned an empty response");
  }
  return text;
};

export const analyze = async (userId, rawResumeId, jobDescription) => {
  if (rawResumeId === undefined || rawResumeId === null || rawResumeId === "") {
    throw badRequest("resumeId is required");
  }
  const resumeId = parseId(rawResumeId, "resumeId");

  if (typeof jobDescription !== "string" || !jobDescription.trim()) {
    throw badRequest("jobDescription is required");
  }
  const trimmedJobDescription = jobDescription.trim();
  if (trimmedJobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
    throw badRequest(
      `jobDescription must be at most ${MAX_JOB_DESCRIPTION_LENGTH} characters`
    );
  }

  // 1. Fetch resume (scoped to the requesting user)
  const resume = await resumeRepository.findByIdAndUser(resumeId, userId);
  if (!resume) {
    throw notFoundError("Resume not found");
  }

  // 2. Build system and user prompts
  const userPrompt = buildUserPrompt(resume.content, trimmedJobDescription);

  // 3. Call Groq API
  const responseText = await callGroq(SYSTEM_PROMPT, userPrompt);

  // 4. Parse response
  let parsed;
  try {
    parsed = JSON.parse(extractJson(responseText));
  } catch {
    throw serverError("AI service returned invalid JSON");
  }
  const result = normalizeAiResult(parsed);

  // 5. Save result
  const analysis = await analysisRepository.create(
    resumeId,
    trimmedJobDescription,
    result,
    result.match_score
  );

  // 6. Return parsed result
  return {
    id: analysis.id,
    resume_id: analysis.resume_id,
    created_at: analysis.created_at,
    ...result,
  };
};

export const getByResume = async (userId, rawResumeId) => {
  const resumeId = parseId(rawResumeId, "resumeId");

  const resume = await resumeRepository.findByIdAndUser(resumeId, userId);
  if (!resume) {
    throw notFoundError("Resume not found");
  }

  return analysisRepository.findAllByResume(resumeId);
};

import path from "node:path";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { client, MODEL } from "./analyzeService.js";
import { badRequest, serverError } from "../utils/httpError.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".md"]);
const MAX_TEXT_LENGTH = 30000;
const EXTRACTION_FAILED = "Failed to extract resume data";

const SYSTEM_PROMPT = `You are an expert resume parser.
Extract the information from the resume text provided by the user.
Return ONLY a valid JSON object with no extra text, no markdown, no backticks.
The JSON must follow this exact structure:
{
  "contact": {
    "name": <string>,
    "email": <string>,
    "phone": <string>,
    "location": <string>,
    "linkedin": <string>,
    "github": <string>,
    "website": <string>
  },
  "summary": <string>,
  "experience": [
    {
      "company": <string>,
      "role": <string>,
      "duration": <string>,
      "bullets": [<string>]
    }
  ],
  "education": [
    {
      "institution": <string>,
      "degree": <string>,
      "year": <string>
    }
  ],
  "skills": [<string>],
  "projects": [
    {
      "name": <string>,
      "description": <string>,
      "tech": [<string>],
      "link": <string>
    }
  ]
}
Rules:
- Use an empty string "" for any text field not present in the resume.
- Use an empty array [] for any list with no entries.
- Do not invent information that is not in the resume.
- Keep bullet points as written, one string per bullet.`;

const getExtension = (filename) => path.extname(filename || "").toLowerCase();

// Multer: memory storage only, nothing is written to disk.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.has(getExtension(file.originalname))) {
      return cb(badRequest("Unsupported file type"));
    }
    return cb(null, true);
  },
});

const extractPdfText = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
};

const extractDocxText = async (buffer) => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

const extractText = async (file) => {
  const extension = getExtension(file.originalname);

  try {
    switch (extension) {
      case ".pdf":
        return await extractPdfText(file.buffer);
      case ".docx":
        return await extractDocxText(file.buffer);
      case ".md":
        return file.buffer.toString("utf-8");
      default:
        throw badRequest("Unsupported file type");
    }
  } catch (err) {
    if (err.status === 400) throw err;
    throw badRequest("Could not read the uploaded file. Make sure it is a valid, unencrypted document");
  }
};

const str = (value) => (typeof value === "string" ? value : "");
const strArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const objArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];

// Coerces the model output into the resume content shape (plus contact),
// so the result can be sent straight to POST /api/resumes.
const normalizeResume = (raw) => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw serverError(EXTRACTION_FAILED);
  }

  const contact = raw.contact && typeof raw.contact === "object" ? raw.contact : {};

  return {
    contact: {
      name: str(contact.name),
      email: str(contact.email),
      phone: str(contact.phone),
      location: str(contact.location),
      linkedin: str(contact.linkedin),
      github: str(contact.github),
      website: str(contact.website),
    },
    summary: str(raw.summary),
    experience: objArray(raw.experience).map((item) => ({
      company: str(item.company),
      role: str(item.role),
      duration: str(item.duration),
      bullets: strArray(item.bullets),
    })),
    education: objArray(raw.education).map((item) => ({
      institution: str(item.institution),
      degree: str(item.degree),
      year: str(item.year),
    })),
    skills: strArray(raw.skills),
    projects: objArray(raw.projects).map((item) => ({
      name: str(item.name),
      description: str(item.description),
      tech: strArray(item.tech),
      link: str(item.link),
    })),
  };
};

const callGroq = async (resumeText) => {
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Resume text:\n\n${resumeText}` },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const text = completion.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from AI service");
    return text;
  } catch (err) {
    console.error("Groq import error:", err?.message ?? err);
    throw serverError(EXTRACTION_FAILED);
  }
};

export const importResume = async (file) => {
  if (!file) {
    throw badRequest("No file uploaded. Send the resume in a form field named 'file'");
  }

  const text = (await extractText(file)).replace(/\u0000/g, "").trim();
  if (!text) {
    throw badRequest("No readable text found in the file");
  }

  const responseText = await callGroq(text.slice(0, MAX_TEXT_LENGTH));

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw serverError(EXTRACTION_FAILED);
  }

  return normalizeResume(parsed);
};

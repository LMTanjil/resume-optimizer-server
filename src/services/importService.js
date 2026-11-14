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
  "title": <string>,
  "content": {
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
}
Rules for "title":
- Format it as "{Role} Resume", based on the person's most recent or most prominent job title, or their primary skill set if there is no job title.
- Examples: "Frontend Developer Resume", "Full Stack Engineer Resume".
- If no role can be inferred, use exactly "My Resume".
Rules for "content.summary":
- Look for a professional summary, objective, about, or profile section and use its text.
- If no such section exists, write a 2-3 sentence professional summary based on the person's experience and skills.
- Never leave the summary empty.
General rules:
- Use an empty string "" for any other text field not present in the resume.
- Use an empty array [] for any list with no entries.
- Apart from the title and a generated summary, do not invent information that is not in the resume.
- Keep bullet points as written, one string per bullet.`;

const DEFAULT_TITLE = "My Resume";

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

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Last-resort summary if the model ignores the "never empty" rule.
const buildFallbackSummary = (content) => {
  const role = content.experience[0]?.role;
  const skills = content.skills.slice(0, 5).join(", ");
  if (role && skills) return `${role} with experience in ${skills}.`;
  if (role) return `Experienced ${role}.`;
  if (skills) return `Professional with skills in ${skills}.`;
  return "Motivated professional seeking new opportunities.";
};

const normalizeTitle = (value) => {
  const title = str(value).trim();
  return title ? title.slice(0, 255) : DEFAULT_TITLE;
};

// Coerces the model output into { title, content }, where content matches the
// resume content shape (plus contact) used by POST /api/resumes.
const normalizeResult = (raw) => {
  if (!isObject(raw)) {
    throw serverError(EXTRACTION_FAILED);
  }

  // Accept a flat object too, in case the model skips the "content" wrapper.
  const content = normalizeContent(isObject(raw.content) ? raw.content : raw);
  if (!content.summary.trim()) {
    content.summary = buildFallbackSummary(content);
  }

  return { title: normalizeTitle(raw.title), content };
};

const normalizeContent = (raw) => {
  const contact = isObject(raw.contact) ? raw.contact : {};

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

  return normalizeResult(parsed);
};

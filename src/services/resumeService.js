import * as resumeRepository from "../repositories/resumeRepository.js";
import { badRequest, notFoundError } from "../utils/httpError.js";

const MAX_TITLE_LENGTH = 255;

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireString = (value, path) => {
  if (typeof value !== "string") {
    throw badRequest(`${path} must be a string`);
  }
};

const requireStringArray = (value, path) => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw badRequest(`${path} must be an array of strings`);
  }
};

const requireObjectArray = (value, path) => {
  if (!Array.isArray(value) || !value.every(isPlainObject)) {
    throw badRequest(`${path} must be an array of objects`);
  }
};

export const parseId = (rawId, name = "id") => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw badRequest(`Invalid ${name}`);
  }
  return id;
};

const validateTitle = (title) => {
  if (typeof title !== "string" || !title.trim()) {
    throw badRequest("Title is required");
  }
  const trimmed = title.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw badRequest(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return trimmed;
};

// Validates the resume content against the required JSONB shape and
// returns a normalized copy containing only the known fields.
const validateContent = (content) => {
  if (!isPlainObject(content)) {
    throw badRequest("Content must be an object");
  }

  const { summary, experience, education, skills, projects } = content;

  requireString(summary, "content.summary");

  requireObjectArray(experience, "content.experience");
  experience.forEach((item, i) => {
    requireString(item.company, `content.experience[${i}].company`);
    requireString(item.role, `content.experience[${i}].role`);
    requireString(item.duration, `content.experience[${i}].duration`);
    requireStringArray(item.bullets, `content.experience[${i}].bullets`);
  });

  requireObjectArray(education, "content.education");
  education.forEach((item, i) => {
    requireString(item.institution, `content.education[${i}].institution`);
    requireString(item.degree, `content.education[${i}].degree`);
    requireString(item.year, `content.education[${i}].year`);
  });

  requireStringArray(skills, "content.skills");

  requireObjectArray(projects, "content.projects");
  projects.forEach((item, i) => {
    requireString(item.name, `content.projects[${i}].name`);
    requireString(item.description, `content.projects[${i}].description`);
    requireStringArray(item.tech, `content.projects[${i}].tech`);
    if (item.link !== undefined && item.link !== null) {
      requireString(item.link, `content.projects[${i}].link`);
    }
  });

  return {
    summary,
    experience: experience.map(({ company, role, duration, bullets }) => ({
      company,
      role,
      duration,
      bullets,
    })),
    education: education.map(({ institution, degree, year }) => ({
      institution,
      degree,
      year,
    })),
    skills,
    projects: projects.map(({ name, description, tech, link }) => ({
      name,
      description,
      tech,
      link: link ?? "",
    })),
  };
};

export const getAll = async (userId) => resumeRepository.findAllByUser(userId);

export const getById = async (userId, rawId) => {
  const id = parseId(rawId, "resume id");
  const resume = await resumeRepository.findByIdAndUser(id, userId);
  if (!resume) {
    throw notFoundError("Resume not found");
  }
  return resume;
};

export const create = async (userId, title, content) => {
  const validTitle = validateTitle(title);
  const validContent = validateContent(content);
  return resumeRepository.create(userId, validTitle, validContent);
};

export const update = async (userId, rawId, title, content) => {
  const id = parseId(rawId, "resume id");

  if (title === undefined && content === undefined) {
    throw badRequest("Provide a title and/or content to update");
  }

  const nextTitleInput = title === undefined ? undefined : validateTitle(title);
  const nextContentInput = content === undefined ? undefined : validateContent(content);

  const existing = await resumeRepository.findByIdAndUser(id, userId);
  if (!existing) {
    throw notFoundError("Resume not found");
  }

  const updated = await resumeRepository.update(
    id,
    userId,
    nextTitleInput ?? existing.title,
    nextContentInput ?? existing.content
  );
  if (!updated) {
    throw notFoundError("Resume not found");
  }
  return updated;
};

export const remove = async (userId, rawId) => {
  const id = parseId(rawId, "resume id");
  const deleted = await resumeRepository.remove(id, userId);
  if (!deleted) {
    throw notFoundError("Resume not found");
  }
  return { message: "Resume deleted", id: deleted.id };
};

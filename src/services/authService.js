import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as userRepository from "../repositories/userRepository.js";
import { badRequest, unauthorized } from "../utils/httpError.js";

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const normalizeEmail = (email) => email.trim().toLowerCase();

const validateCredentials = (email, password) => {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    throw badRequest("Email and password are required");
  }
};

const generateToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  created_at: user.created_at,
});

export const register = async (email, password) => {
  validateCredentials(email, password);
  const normalizedEmail = normalizeEmail(email);

  if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 255) {
    throw badRequest("Invalid email address");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existing = await userRepository.findByEmail(normalizedEmail);
  if (existing) {
    throw badRequest("Email already in use");
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create(normalizedEmail, password_hash);

  return { token: generateToken(user), user: toPublicUser(user) };
};

export const login = async (email, password) => {
  validateCredentials(email, password);
  const normalizedEmail = normalizeEmail(email);

  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) {
    throw unauthorized("Invalid email or password");
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw unauthorized("Invalid email or password");
  }

  return { token: generateToken(user), user: toPublicUser(user) };
};


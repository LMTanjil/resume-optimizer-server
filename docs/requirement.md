# Resume Optimizer Backend Spec & Requirement

## Project Info

- **Repo name:** `resume-optimizer-server`
- **Stack:** Node.js, Express, PostgreSQL, `pg` (no ORM), JWT, bcrypt, Groq SDK via `openai` npm package

---

## Architecture Pattern

This project follows a 4-layer architecture:

```
Controller  →  Service  →  Repository  →  Database
```

- **Controller** — handles request/response only, no business logic
- **Service** — all business logic lives here (validation, AI prompt building, token generation)
- **Repository** — only SQL queries, returns raw data, nothing else
- **Middleware** — auth verification, error handling

---

## Folder Structure

```
resume-optimizer-server/
├── src/
│   ├── config/
│   │   └── db.js                    # PostgreSQL connection pool
│   ├── controllers/
│   │   ├── authController.js        # parse req, call service, send res
│   │   ├── resumeController.js
│   │   └── analyzeController.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── resumeRoutes.js
│   │   └── analyzeRoutes.js
│   ├── services/
│   │   ├── authService.js           # register/login logic, JWT generation
│   │   ├── resumeService.js         # resume CRUD business logic
│   │   └── analyzeService.js        # build prompt, call Groq, parse response
│   ├── repositories/
│   │   ├── userRepository.js        # all SQL for users table
│   │   ├── resumeRepository.js      # all SQL for resumes table
│   │   └── analysisRepository.js   # all SQL for analyses table
│   ├── middleware/
│   │   ├── authMiddleware.js        # verify JWT, attach req.user
│   │   └── errorHandler.js
│   └── app.js
├── .env
├── .env.example
├── .gitignore
└── server.js                        # entry point
```

---

## Environment Variables

**.env**
```
PORT=5000
DATABASE_URL=postgresql://localhost:5432/resume_optimizer
JWT_SECRET=your_jwt_secret_here
GROQ_API_KEY=your_groq_api_key_here
```

---

## Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE resumes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
  job_description TEXT NOT NULL,
  ai_response JSONB NOT NULL,
  match_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login

GET    /api/resumes              # protected
POST   /api/resumes              # protected
GET    /api/resumes/:id          # protected
PUT    /api/resumes/:id          # protected
DELETE /api/resumes/:id          # protected

POST   /api/analyze              # protected — body: { resumeId, jobDescription }
GET    /api/analyze/:resumeId    # protected
```

---

## Layer Responsibilities

### Controller (thin — only req/res)

```js
// authController.js
const register = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const result = await authService.register(email, password)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}
```

### Service (business logic)

```js
// authService.js
const register = async (email, password) => {
  const existing = await userRepository.findByEmail(email)
  if (existing) throw new Error("Email already in use")
  const password_hash = await bcrypt.hash(password, 10)
  const user = await userRepository.create(email, password_hash)
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  )
  return { token }
}
```

### Repository (SQL only)

```js
// userRepository.js
const findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  )
  return result.rows[0]
}

const create = async (email, password_hash) => {
  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [email, password_hash]
  )
  return result.rows[0]
}
```

---

## Auth Logic

- **Register:** check email not taken in service, hash password with bcrypt (salt rounds 10), save via repository, return JWT
- **Login:** find user by email via repository, compare password with bcrypt in service, return JWT
- **JWT payload:** `{ id: user.id, email: user.email }`
- **JWT expiry:** `7d`
- **authMiddleware:** extract token from `Authorization: Bearer <token>` header, verify with `jwt.verify`, attach `req.user` to the request

---

## Resume Content JSONB Shape

The resume `content` field must follow this structure:

```json
{
  "summary": "Brief professional summary",
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "duration": "Jan 2023 - Present",
      "bullets": ["Did this", "Built that"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "BSc Computer Science",
      "year": "2024"
    }
  ],
  "skills": ["React", "Node.js", "PostgreSQL"],
  "projects": [
    {
      "name": "Project Name",
      "description": "What it does",
      "tech": ["React", "Express"],
      "link": "https://github.com/..."
    }
  ]
}
```

---

## Groq AI Integration

The Groq client setup and prompt logic lives in `analyzeService.js`, not the controller.

**Client setup:**

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});
```

**Model to use:** `llama-3.3-70b-versatile`

**System prompt:**
```
You are an expert resume analyzer.
Analyze the resume against the job description.
Return ONLY a valid JSON object with no extra text, no markdown, no backticks.
The JSON must follow this exact structure:
{
  "match_score": <number 0-100>,
  "missing_keywords": [<string>],
  "suggestions": [<string>],
  "strengths": [<string>]
}
```

**User prompt:**
```
Resume: ${JSON.stringify(resumeContent)}

Job Description: ${jobDescription}
```

**Flow in analyzeService.js:**
1. Fetch resume from `resumeRepository` using `resumeId`
2. Build system and user prompts
3. Call Groq API
4. Parse response with `JSON.parse()`
5. Save result via `analysisRepository`
6. Return parsed result to controller

---

## Error Handling

- All controllers use try/catch and pass errors to `next(err)`
- All services throw errors with clear messages
- `errorHandler.js` catches everything and returns:

```json
{ "error": "message here" }
```

Status codes:
- `400` bad input
- `401` unauthorized
- `404` not found
- `500` server error

---

## Important Instructions for Claude Code

- Use ES modules (`import/export`), not CommonJS
- Use `pg` Pool for all database queries, no ORM
- Follow the Controller → Service → Repository pattern strictly
- Controllers only handle req/res — no business logic, no SQL
- Services handle all logic — call repositories, never use `pool` directly
- Repositories only contain SQL — no logic, no bcrypt, no JWT
- All protected routes must go through `authMiddleware`
- Never return `password_hash` in any response
- Add a `GET /health` route that returns `{ status: "ok" }`
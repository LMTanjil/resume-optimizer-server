# ResumeAI — Backend

Express REST API for the ResumeAI application.

## Tech Stack

- Node.js + Express
- PostgreSQL (raw SQL with `pg`, no ORM)
- JWT authentication with bcrypt
- Groq AI API (`openai/gpt-oss-120b` via the OpenAI-compatible SDK)
- multer + mammoth + pdf-parse for file imports

## Project Structure

```
src/
├── config/        # Database connection pool
├── controllers/   # Request/response handlers
├── services/      # Business logic
├── repositories/  # SQL queries
├── middleware/    # Auth, error handling
├── routes/        # Express routers
└── utils/         # HTTP error helpers
```

Requests flow **Controller → Service → Repository → Database**. Controllers only handle req/res, services hold all business logic, and repositories contain only SQL.

## Getting Started

### Prerequisites

- Node.js v22+ (required by the `openai` SDK)
- PostgreSQL running locally

### Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database:

   ```bash
   createdb resume_optimizer
   ```

3. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

4. Run the database schema:

   ```bash
   psql "your-database-url" -f schema.sql
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

The server runs on `http://localhost:5000` by default.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default `5000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `GROQ_API_KEY` | API key from [console.groq.com](https://console.groq.com) |

## API Endpoints

### Auth

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user — body: `{ name, email, password }` |
| POST | `/api/auth/login` | Login and get token — body: `{ email, password }` |

Both return `{ token, user: { id, name, email, created_at } }`. Tokens expire after 7 days.

### Resumes

| Method | Route | Description |
|---|---|---|
| GET | `/api/resumes` | Get all resumes for logged-in user |
| POST | `/api/resumes` | Create a new resume — body: `{ title, content }` |
| GET | `/api/resumes/:id` | Get a single resume |
| PUT | `/api/resumes/:id` | Update a resume — body: `{ title?, content? }` |
| DELETE | `/api/resumes/:id` | Delete a resume |

Resume `content` shape:

```json
{
  "contact": {
    "name": "", "email": "", "phone": "", "location": "",
    "linkedin": "", "github": "", "website": ""
  },
  "summary": "Brief professional summary",
  "experience": [
    { "company": "", "role": "", "duration": "", "bullets": [""] }
  ],
  "education": [
    { "institution": "", "degree": "", "year": "" }
  ],
  "skills": [""],
  "projects": [
    { "name": "", "description": "", "tech": [""], "link": "" }
  ]
}
```

`contact` is optional; missing contact fields are stored as empty strings. `content` is replaced as a whole on update, so always send `contact` along with the rest of the content.

### Analyze

| Method | Route | Description |
|---|---|---|
| POST | `/api/analyze` | Analyze resume against job description — body: `{ resumeId, jobDescription }` |
| GET | `/api/analyze/:resumeId` | Get past analyses for a resume |

Returns `match_score` (0–100), `missing_keywords`, `suggestions` and `strengths`.

### Import

| Method | Route | Description |
|---|---|---|
| POST | `/api/resume/import` | Extract resume data from PDF, DOCX or MD file |

Send `multipart/form-data` with the file in a field named `file` (max 5MB). Returns `{ title, content }`, where `content` matches the resume shape above. The data is not saved — send it to `POST /api/resumes` to store it.

### Health

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Check server is running |

## Auth

All routes except `/api/auth/*` and `/health` require a Bearer token:

```
Authorization: Bearer <token>
```

## Errors

All errors return JSON in the form `{ "error": "message" }` with status `400` (bad input), `401` (unauthorized), `404` (not found) or `500` (server error).

## Deployment

Recommended stack:

- Backend: Railway or Render
- Database: Neon (managed PostgreSQL)

Set the same environment variables in your hosting provider. For Neon, use the connection string Neon provides, which includes `?sslmode=require` — `pg` reads SSL settings from the connection string, so no code change is needed.

Run `schema.sql` against the production database once before first deploy.

# Tracking Lamaran

A job application tracker for Indonesian job seekers. Free, no ads, self-hosted.

Applying for jobs is a long process with many branches. An active job seeker can have
30–80 live applications, each with its own stage, schedule, contacts and CV version.
A spreadsheet holds some of that, but it does not remind you, does not keep your
documents, and does not calculate anything.

> **Status: in development.** The application layer is working — Google sign-in, MySQL
> storage, and all tracking features. Document upload and email reminders are not built
> yet. Not deployed publicly.

## Features

- **Pipeline** — 11 stages from wishlist to accepted, drag and drop, keyboard reachable
- **Applications** — 14 fields per entry, search across 7 filters, tags, archive
- **Timeline** — every status change and manual note, in order
- **Statistics** — pass rate per stage, average response time, which job sources actually reply
- **Reminders and calendar** — interviews, tests, follow-ups, deadlines
- **Interview notes** — questions, answers, feedback, what to study next
- **Bookmarks and company wishlist** — save a posting before applying, convert it in one step
- Indonesian and English, light and dark, built for phones first

## Stack

| Layer | Choice |
|---|---|
| Frontend | TypeScript · React 19 · Vite · Tailwind v4 |
| Backend | Node.js · Express 5 — one process serving `/api/*` and the built frontend |
| Database | MySQL or MariaDB · Drizzle ORM |
| Auth | Google Identity Services → signed session cookie |
| Files | Cloudflare R2 via presigned URLs *(planned)* |
| Email | Resend *(planned)* |

Six server runtime dependencies: `express`, `cookie-parser`, `drizzle-orm`, `mysql2`,
`aws4fetch`, `zod`. No framework beyond React, no Docker, no queue. (`package.json`
lists the frontend and build packages under `dependencies` too — the six refers to
what the Node process itself loads.)

## Running locally

Requires Node 22.6+ and MySQL 8 or MariaDB.

Development runs against MySQL 8; the deployed instance runs MariaDB 11.8, which is what shared hosting provides. The schema and every migration apply unchanged on both. Node 22.6 is the real floor because the server runs TypeScript through Node's own type stripping, which does not exist before that.

```bash
npm install
cp .env.example .env    # then fill in the values
npm run migrate         # create the tables
npm run dev             # backend and frontend together, Ctrl+C stops both
```

The app runs at `http://localhost:5173`. Sign-in needs a Google OAuth client ID with
`http://localhost:5173` listed under authorised JavaScript origins.

| Command | |
|---|---|
| `npm run dev` | Backend and frontend together |
| `npm run build` | Typecheck and build the frontend |
| `npm start` | Run the server against `dist/` |
| `npm run lint` / `format` | Biome |
| `npm run db:generate` | Write a migration from schema changes |
| `npm run migrate` | Apply pending migrations |

## Layout

```
src/      frontend — React pages and components
server/   backend — never imported by the frontend
shared/   types used by both sides
drizzle/  migration SQL, committed and reviewable
```

Secrets are read only in `server/`. Anything under `src/` ends up in the user's browser.

## Privacy

The contents of this app are a list of the companies someone is applying to, often while
still employed elsewhere. It is treated as sensitive personal data: no user can see
another user's data, only name, email and profile picture are requested from Google, and
there are no third-party trackers or analytics.

## License

MIT — see [LICENSE](LICENSE). Use it, change it, host your own.

Privacy policy for the hosted instance: [/privasi.html](https://trackinglamaran.site/privasi.html)

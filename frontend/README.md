# Campus Connect frontend

The app opens directly to public event discovery. Its demo profile switcher
lets visitors select or add a display profile; the selected profile is saved in
the backend database for that browser. Visitors can register demo profiles for
events, and see those registrations under **My registrations**. These demo
profiles are not authenticated users and must not be treated as verified people.

## Local setup

1. Install Node.js 20.19+ (or 22.12+).
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_API_BASE_URL`: the deployed Flask API URL, with no trailing slash.
3. Run `npm install`, then `npm run dev`.

No database key belongs in the frontend. Keep Supabase credentials on the
backend only.

Before using the profile switcher, run `backend/demo_profiles.sql` once in the
Supabase SQL Editor. This creates public demo-only profile and per-browser
selection tables; it does not grant access to real user accounts.

## Render static site

Create a **Static Site** from this repository and set its root directory to
`frontend`, build command to `npm ci && npm run build`, and publish directory
to `dist`. Set `VITE_API_BASE_URL` in the Render service settings before
deploying. In the backend Render service, set `FRONTEND_ORIGIN` to the
frontend's exact `https://...onrender.com` URL so the browser can call the API.

## Vercel

Import this repository into Vercel and set the **Root Directory** to `frontend`.
The included `vercel.json` configures Vite, `npm ci`, `npm run build`, and the
`dist` output directory. Add the same three `VITE_` environment variables from
`.env.example` in Vercel's project settings, then deploy. Set the backend's
`FRONTEND_ORIGIN` to the exact Vercel URL (for example,
`https://your-project.vercel.app`) and redeploy the backend so its CORS policy
allows the frontend.

The pages use `GET /api/events`, `GET /api/events/{id}`, the demo profile
endpoints, and `GET/POST /api/demo-registrations`.

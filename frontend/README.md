# Campus Connect frontend

The app flow starts with sign in, then opens event discovery. From there a
student can open event details, register, and review their registrations.
Organizers can open the attendee page for one of their events; the backend
checks organizer ownership.

## Local setup

1. Install Node.js 20.19+ (or 22.12+).
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_API_BASE_URL`: the deployed Flask API URL, with no trailing slash.
   - `VITE_SUPABASE_URL`: the Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: the Supabase public anon key.
3. Run `npm install`, then `npm run dev`.

The anon key is intended for browser use. Never place a Supabase `service_role`
or secret key in a `VITE_` variable; frontend variables are visible to visitors.

## Render static site

Create a **Static Site** from this repository and set its root directory to
`frontend`, build command to `npm ci && npm run build`, and publish directory
to `dist`. Set the three `VITE_` variables above in the Render service settings
before deploying. In the backend Render service, set `FRONTEND_ORIGIN` to the
frontend's exact `https://...onrender.com` URL so the browser can call the API.

## Vercel

Import this repository into Vercel and set the **Root Directory** to `frontend`.
The included `vercel.json` configures Vite, `npm ci`, `npm run build`, and the
`dist` output directory. Add the same three `VITE_` environment variables from
`.env.example` in Vercel's project settings, then deploy. Set the backend's
`FRONTEND_ORIGIN` to the exact Vercel URL (for example,
`https://your-project.vercel.app`) and redeploy the backend so its CORS policy
allows the frontend.

The pages use `GET /api/events`, `GET /api/events/{id}`,
`POST /api/registrations`, `GET /api/me/registrations`, and
`GET /api/events/{id}/registrations`. Supabase Auth handles sign-in/sign-up;
the access token is sent as a bearer token to protected Flask endpoints.

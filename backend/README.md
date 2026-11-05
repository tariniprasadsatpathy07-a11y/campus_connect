# Events API deployment

## Deploy on Render

1. Push this repository to a Git provider connected to Render.
2. In Render, choose **New + → Blueprint** and select the repository. The root
   `render.yaml` defines the web service and its build, start, and health-check
   commands.
3. Enter `SUPABASE_URL` and `SUPABASE_KEY` when Render prompts for the
   unsynced environment variables. Use the Supabase project URL and its public
   anon key. Do not use the `service_role` key.
4. Deploy. Render serves the API at the service URL; `/health` returns a
   lightweight health response.

The app expects the Supabase `events` and `registration` tables and the
associated Auth, grants, and row-level security policies to already exist.
Set `FRONTEND_ORIGIN` to the exact URL of the deployed frontend (or a
comma-separated list of allowed frontend origins). It defaults to the Vite
local-development URL.
Local development can copy `.env.example` to `.env` and fill in the same two
values. Install dependencies with `pip install -r requirements.txt` and run
`gunicorn app:app` (or `flask --app app run` for local-only development).

## Demo profile switcher

To support the frontend's unauthenticated demo profile switcher, run
`demo_profiles.sql` once in the Supabase SQL Editor. It creates public demo-only
profile and per-browser preference tables. The chosen profile is stored against
a browser-generated ID. These demo profiles do not authenticate a person and
must not be used for private data or real verified identities. Demo event
registrations are stored separately from real user registrations. Redeploy the
backend after changing `app.py` so the `/api/demo-users`, `/api/demo-user`, and
`/api/demo-registrations` routes are available.

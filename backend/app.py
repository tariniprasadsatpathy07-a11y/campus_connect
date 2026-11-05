import os
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, request, g
from supabase import create_client, Client
from postgrest.exceptions import APIError

load_dotenv()


def create_supabase_client(access_token=None) -> Client:
    """Create a request-scoped Supabase client using the public anon key."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")  # Use the anon/publishable key, NOT service_role.
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured")

    client = create_client(url, key)
    if access_token:
        client.postgrest.auth(access_token)
    return client


def create_app():
    app = Flask(__name__)

    allowed_origins = {
        origin.strip().rstrip("/")
        for origin in os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
        if origin.strip()
    }
    # Keep the production frontend origin allowed even when the optional
    # FRONTEND_ORIGIN environment variable has not yet been configured.
    allowed_origins.add("https://campus-connect-ren7.vercel.app")

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            return "", 204

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "").rstrip("/")
        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
            response.headers["Access-Control-Max-Age"] = "600"
            response.headers.add("Vary", "Origin")
        return response

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(400)
    def bad_request(_error):
        return jsonify({"error": "Bad request"}), 400

    def require_auth(handler):
        @wraps(handler)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return jsonify({"error": "Authentication required"}), 401

            token = header.split(" ", 1)[1].strip()
            if not token:
                return jsonify({"error": "Authentication required"}), 401

            try:
                client = create_supabase_client()
                auth_response = client.auth.get_user(token)
                auth_user = auth_response.user
                if not auth_user:
                    return jsonify({"error": "Invalid or expired token"}), 401

                # Forward the user's JWT so Postgres RLS policies apply.
                client.postgrest.auth(token)
                g.supabase = client
                g.user_id = str(auth_user.id)
                g.auth_user = auth_user
            except Exception:
                return jsonify({"error": "Invalid or expired token"}), 401

            return handler(*args, **kwargs)
        return wrapper

    def db():
        # Public event browsing uses the anon key; authenticated routes use
        # the request-scoped client carrying the user's JWT.
        if hasattr(g, "supabase"):
            return g.supabase
        return create_supabase_client()

    def parse_uuid(value):
        # PostgreSQL validates UUIDs too; this gives clients a clean 400.
        import uuid
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, TypeError, AttributeError):
            return None

    @app.get("/")
    def index():
        return jsonify({
            "message": "Events API is running",
            "endpoints": [
                "GET /api/events",
                "GET /api/events/<id>",
                "GET /api/demo-users",
                "POST /api/demo-users",
                "GET /api/demo-user",
                "PUT /api/demo-user",
                "GET /api/demo-registrations",
                "POST /api/demo-registrations",
                "POST /api/registrations",
                "GET /api/me/registrations",
                "GET /api/events/<id>/registrations",
            ],
        })

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    # Demo profiles are public display identities only. They are deliberately
    # separate from Supabase Auth users and must never authorize real accounts.
    @app.get("/api/demo-users")
    def list_demo_users():
        try:
            result = db().table("demo_profiles").select("id,display_name").order("display_name").execute()
            return jsonify({"data": result.data}), 200
        except APIError as error:
            app.logger.exception("Could not load demo profiles")
            return jsonify({"error": "Could not load demo profiles. Apply backend/demo_profiles.sql first.", "details": str(error)}), 500

    @app.post("/api/demo-users")
    def create_demo_user():
        body = request.get_json(silent=True) or {}
        display_name = str(body.get("display_name", "")).strip()
        if not display_name or len(display_name) > 60:
            return jsonify({"error": "display_name must be between 1 and 60 characters"}), 400
        try:
            result = db().table("demo_profiles").insert({"display_name": display_name}).execute()
            return jsonify({"data": result.data[0] if result.data else None}), 201
        except APIError as error:
            if "duplicate" in str(error).lower() or "unique" in str(error).lower():
                return jsonify({"error": "A demo profile with that name already exists"}), 409
            app.logger.exception("Could not create demo profile")
            return jsonify({"error": "Could not create demo profile", "details": str(error)}), 500

    @app.get("/api/demo-user")
    def get_demo_user():
        device_id = parse_uuid(request.args.get("device_id"))
        if not device_id:
            return jsonify({"error": "A valid device_id is required"}), 400
        try:
            result = (
                db().table("demo_user_preferences")
                .select("device_id,demo_profile_id")
                .eq("device_id", device_id)
                .limit(1)
                .execute()
            )
            return jsonify({"data": result.data[0] if result.data else None}), 200
        except APIError as error:
            app.logger.exception("Could not load saved demo profile")
            return jsonify({"error": "Demo profile tables are not ready. Run backend/demo_profiles.sql in the Supabase SQL Editor.", "details": str(error)}), 500
        except Exception as error:
            app.logger.exception("Unexpected error while loading saved demo profile")
            return jsonify({"error": "Could not load saved demo profile", "details": str(error)}), 500

    @app.put("/api/demo-user")
    def save_demo_user():
        body = request.get_json(silent=True) or {}
        device_id = parse_uuid(body.get("device_id"))
        demo_profile_id = parse_uuid(body.get("demo_profile_id"))
        if not device_id or not demo_profile_id:
            return jsonify({"error": "Valid device_id and demo_profile_id are required"}), 400
        try:
            result = db().table("demo_user_preferences").upsert(
                {"device_id": device_id, "demo_profile_id": demo_profile_id},
                on_conflict="device_id",
            ).execute()
            return jsonify({"data": result.data[0] if result.data else None}), 200
        except APIError as error:
            app.logger.exception("Could not save selected demo profile")
            return jsonify({"error": "Could not save selected demo profile", "details": str(error)}), 500

    @app.get("/api/demo-registrations")
    def list_demo_registrations():
        demo_profile_id = parse_uuid(request.args.get("demo_profile_id"))
        if not demo_profile_id:
            return jsonify({"error": "A valid demo_profile_id is required"}), 400
        try:
            result = (
                db().table("demo_registrations")
                .select("id,demo_profile_id,event_id,created_at,events(*)")
                .eq("demo_profile_id", demo_profile_id)
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify({"data": result.data}), 200
        except APIError as error:
            app.logger.exception("Could not load demo registrations")
            return jsonify({"error": "Demo registration tables are not ready. Run backend/demo_profiles.sql in the Supabase SQL Editor.", "details": str(error)}), 500

    @app.post("/api/demo-registrations")
    def create_demo_registration():
        body = request.get_json(silent=True) or {}
        demo_profile_id = parse_uuid(body.get("demo_profile_id"))
        event_id = parse_uuid(body.get("event_id"))
        if not demo_profile_id or not event_id:
            return jsonify({"error": "Valid demo_profile_id and event_id are required"}), 400

        try:
            profile = (
                db().table("demo_profiles")
                .select("id,display_name")
                .eq("id", demo_profile_id)
                .maybe_single()
                .execute()
            ).data
            if not profile:
                return jsonify({"error": "Demo profile not found"}), 404

            event = (
                db().table("events")
                .select("id,capacity")
                .eq("id", event_id)
                .maybe_single()
                .execute()
            ).data
            if not event:
                return jsonify({"error": "Event not found"}), 404

            existing = (
                db().table("demo_registrations")
                .select("id")
                .eq("demo_profile_id", demo_profile_id)
                .eq("event_id", event_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                return jsonify({"error": "This demo profile is already registered for the event"}), 409

            capacity = event.get("capacity")
            if capacity is not None:
                count = (
                    db().table("demo_registrations")
                    .select("id", count="exact")
                    .eq("event_id", event_id)
                    .execute()
                )
                if (count.count or 0) >= capacity:
                    return jsonify({"error": "This event is full"}), 409

            inserted = db().table("demo_registrations").insert({
                "demo_profile_id": demo_profile_id,
                "event_id": event_id,
            }).execute()
            return jsonify({
                "message": f"{profile['display_name']} is registered for the event",
                "data": inserted.data[0] if inserted.data else None,
            }), 201
        except APIError as error:
            if "duplicate" in str(error).lower() or "unique" in str(error).lower():
                return jsonify({"error": "This demo profile is already registered for the event"}), 409
            app.logger.exception("Could not create demo registration")
            return jsonify({"error": "Could not create demo registration. Check that backend/demo_profiles.sql has been run.", "details": str(error)}), 500

    # GET /api/events
    @app.get("/api/events")
    def list_events():
        try:
            limit = min(max(int(request.args.get("limit", 20)), 1), 100)
            offset = max(int(request.args.get("offset", 0)), 0)
        except ValueError:
            return jsonify({"error": "limit and offset must be integers"}), 400

        try:
            result = (
                db().table("events")
                .select("*")
                .order("timestamp", desc=False)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return jsonify({"data": result.data, "limit": limit, "offset": offset}), 200
        except APIError as error:
            app.logger.exception("Could not load events")
            return jsonify({"error": "Could not load events", "details": str(error)}), 500

    # GET /api/events/<id>
    @app.get("/api/events/<event_id>")
    def get_event(event_id):
        event_id = parse_uuid(event_id)
        if not event_id:
            return jsonify({"error": "Invalid event ID"}), 400

        try:
            result = (
                db().table("events")
                .select("*")
                .eq("id", event_id)
                .maybe_single()
                .execute()
            )
            if not result.data:
                return jsonify({"error": "Event not found"}), 404
            return jsonify({"data": result.data}), 200
        except APIError as error:
            app.logger.exception("Could not load event")
            return jsonify({"error": "Could not load event", "details": str(error)}), 500

    # POST /api/registrations
    @app.post("/api/registrations")
    @require_auth
    def create_registration():
        body = request.get_json(silent=True) or {}
        event_id = parse_uuid(body.get("event_id"))
        if not event_id:
            return jsonify({"error": "A valid event_id is required"}), 400

        client = g.supabase
        try:
            event_result = (
                client.table("events")
                .select("id,capacity")
                .eq("id", event_id)
                .maybe_single()
                .execute()
            )
            event = event_result.data
            if not event:
                return jsonify({"error": "Event not found"}), 404

            existing = (
                client.table("registration")
                .select("id")
                .eq("event_id", event_id)
                .eq("user_id", g.user_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                return jsonify({"error": "You are already registered for this event"}), 409

            capacity = event.get("capacity")
            if capacity is not None:
                count_result = (
                    client.table("registration")
                    .select("id", count="exact")
                    .eq("event_id", event_id)
                    .execute()
                )
                if (count_result.count or 0) >= capacity:
                    return jsonify({"error": "Event is full"}), 409

            inserted = (
                client.table("registration")
                .insert({"event_id": event_id, "user_id": g.user_id})
                .execute()
            )
            return jsonify({
                "message": "Registration successful",
                "data": inserted.data[0] if inserted.data else None,
            }), 201

        except APIError as error:
            # The unique constraint in schema.sql also protects against
            # duplicate registrations caused by simultaneous requests.
            message = str(error).lower()
            if "duplicate" in message or "unique" in message:
                return jsonify({"error": "You are already registered for this event"}), 409
            app.logger.exception("Registration failed")
            return jsonify({"error": "Registration failed", "details": str(error)}), 500

    # GET /api/me/registrations
    @app.get("/api/me/registrations")
    @require_auth
    def my_registrations():
        try:
            result = (
                g.supabase.table("registration")
                .select("id,user_id,event_id,created_at,events(*)")
                .eq("user_id", g.user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify({"data": result.data}), 200
        except APIError as error:
            app.logger.exception("Could not load user registrations")
            return jsonify({"error": "Could not load registrations", "details": str(error)}), 500

    # GET /api/events/<id>/registrations — event organizer only
    @app.get("/api/events/<event_id>/registrations")
    @require_auth
    def event_registrations(event_id):
        event_id = parse_uuid(event_id)
        if not event_id:
            return jsonify({"error": "Invalid event ID"}), 400

        try:
            event_result = (
                g.supabase.table("events")
                .select("id,organiser_id")
                .eq("id", event_id)
                .maybe_single()
                .execute()
            )
            event = event_result.data   
            if not event:
                return jsonify({"error": "Event not found"}), 404

            if str(event["organiser_id"]) != g.user_id:
                return jsonify({"error": "Only this event's organizer can view attendees"}), 403

            attendees = (
                g.supabase.table("registration")
                .select("id,user_id,event_id,created_at,user(email)")
                .eq("event_id", event_id)
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify({"data": attendees.data}), 200
        except APIError as error:
            app.logger.exception("Could not load attendees")
            return jsonify({"error": "Could not load attendees", "details": str(error)}), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))

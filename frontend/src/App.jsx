import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const steps = ["Sign in", "Explore", "Event details", "My registrations", "Organizer attendees"];
const titleOf = (event) => event?.title || event?.name || "Campus event";
const dateOf = (event) => event?.timestamp || event?.starts_at || event?.date || event?.created_at;
const placeOf = (event) => event?.location || event?.venue || "Campus location";
const descriptionOf = (event) => event?.description || "More event details will be added by the organizer.";

function formatDate(value) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("login");
  const [authMode, setAuthMode] = useState("login");
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All events");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) setScreen("events");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) setScreen((current) => ["login", "signup"].includes(current) ? "events" : current);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function api(path, options = {}, requiresAuth = false) {
    if (!apiBase) throw new Error("Set VITE_API_BASE_URL in frontend/.env.local first.");
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (requiresAuth) {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Please sign in again to continue.");
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  async function loadEvents() {
    setError("");
    try {
      const payload = await api("/api/events?limit=100");
      setEvents(payload.data || []);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { if (session) loadEvents(); }, [session]);

  async function loadRegistrations() {
    setBusy(true); setError("");
    try { const payload = await api("/api/me/registrations", {}, true); setRegistrations(payload.data || []); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function showEvent(event) {
    setSelectedEvent(event); setScreen("detail"); setMessage(""); setError("");
    try {
      const payload = await api(`/api/events/${encodeURIComponent(event.id)}`);
      setSelectedEvent(payload.data || event);
    } catch (err) { setError(err.message); }
  }

  async function register() {
    if (!selectedEvent) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = await api("/api/registrations", { method: "POST", body: JSON.stringify({ event_id: selectedEvent.id }) }, true);
      setMessage(payload.message || "You're registered for this event.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadAttendees(event) {
    setSelectedEvent(event); setAttendees([]); setBusy(true); setError("");
    try { const payload = await api(`/api/events/${encodeURIComponent(event.id)}/registrations`, {}, true); setAttendees(payload.data || []); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function signIn(event) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (!supabase) throw new Error("Set the Supabase URL and public anon key in the frontend environment variables.");
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") })
        : await supabase.auth.signUp({ email: form.get("email"), password: form.get("password") });
      if (result.error) throw result.error;
      if (!result.data.session && authMode === "signup") setMessage("Check your email to confirm your account, then sign in.");
      else setScreen("events");
    } catch (err) { setError(err.message || "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null); setScreen("login"); setMessage(""); setError("");
  }

  const filteredEvents = useMemo(() => events.filter((event) => {
    const query = search.trim().toLowerCase();
    const text = `${titleOf(event)} ${descriptionOf(event)} ${placeOf(event)} ${event.category || ""}`.toLowerCase();
    const matchesSearch = !query || text.includes(query);
    const category = String(event.category || "Other");
    return matchesSearch && (filter === "All events" || category === filter);
  }), [events, search, filter]);
  const categories = useMemo(() => ["All events", ...new Set(events.map((event) => event.category).filter(Boolean))], [events]);

  function navigate(next) {
    setScreen(next); setMessage(""); setError("");
    if (next === "registrations") loadRegistrations();
    if (next === "attendees" && events.length && !selectedEvent) loadAttendees(events[0]);
  }

  if (["login", "signup"].includes(screen) || !session) {
    return <AuthPage mode={authMode} setMode={(mode) => { setAuthMode(mode); setScreen(mode === "login" ? "login" : "signup"); setError(""); }} onSubmit={signIn} busy={busy} error={error} message={message} />;
  }

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => navigate("events")}><span className="brand-mark">CC</span><span>Campus <b>Connect</b></span></button>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={screen === "events" || screen === "detail" ? "active" : ""} onClick={() => navigate("events")}>Explore events</button>
        <button className={screen === "registrations" ? "active" : ""} onClick={() => navigate("registrations")}>My registrations</button>
        <button className={screen === "attendees" ? "active" : ""} onClick={() => navigate("attendees")}>Organizer attendees</button>
      </nav>
      <div className="account"><span className="avatar">{session.user.email?.[0]?.toUpperCase() || "S"}</span><span className="account-email">{session.user.email}</span><button className="text-button" onClick={signOut}>Sign out</button></div>
    </header>
    <main className="page-wrap">
      <div className="flow-steps" aria-label="App flow">{steps.slice(1).map((step, index) => <span key={step} className={(screen === ["events", "detail", "registrations", "attendees"][index] ? "current " : "") + "flow-step"}><i>{index + 1}</i>{step}</span>)}</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}

      {screen === "events" && <>
        <section className="hero">
          <div className="hero-copy"><span className="eyebrow">YOUR CAMPUS, YOUR COMMUNITY</span><h1>Find your next<br /><em>great moment.</em></h1><p>Discover events, meet your people, and make campus feel like yours.</p>
            <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, places, or interests" aria-label="Search events" /></label>
          </div><div className="hero-art" aria-hidden="true"><div className="sun"></div><span className="art-star">✳</span><span className="art-note">Meet me<br />there ↗</span><div className="art-ticket"><b>GOOD<br />THINGS<br />HAPPEN<br />HERE.</b><span>★ CAMPUS CONNECT</span></div></div>
        </section>
        <div className="section-heading"><div><span className="eyebrow">WHAT’S HAPPENING</span><h2>Explore campus events</h2></div><span className="result-count">{filteredEvents.length} events</span></div>
        <div className="filters" role="group" aria-label="Event categories">{categories.map((category) => <button key={category} className={filter === category ? "chip selected" : "chip"} onClick={() => setFilter(category)}>{category}</button>)}</div>
        {events.length === 0 && !error ? <LoadingState text="Loading campus events…" /> : filteredEvents.length === 0 ? <EmptyState title="No events found" text="Try another search or category." /> : <div className="event-grid">{filteredEvents.map((event, index) => <EventCard key={event.id || index} event={event} onOpen={() => showEvent(event)} />)}</div>}
      </>}

      {screen === "detail" && selectedEvent && <section className="detail-layout">
        <div className="detail-main"><button className="back-link" onClick={() => navigate("events")}>← Back to events</button><div className="detail-cover"><span className="cover-label">CAMPUS CONNECT · EVENT</span><span className="cover-graphic">✳</span><span className="cover-date">{formatDate(dateOf(selectedEvent))}</span></div><span className="eyebrow">{selectedEvent.category || "CAMPUS EVENT"}</span><h1>{titleOf(selectedEvent)}</h1><p className="detail-description">{descriptionOf(selectedEvent)}</p><div className="detail-facts"><Fact icon="◷" label="Date & time" value={formatDate(dateOf(selectedEvent))} /><Fact icon="⌖" label="Location" value={placeOf(selectedEvent)} /><Fact icon="◎" label="Organizer" value={selectedEvent.organizer || selectedEvent.organiser_name || "Campus organizer"} /></div>
        </div><aside className="register-card"><span className="eyebrow">SAVE YOUR SPOT</span><h3>Join the event</h3><p>{selectedEvent.capacity ? `${selectedEvent.capacity} spots available` : "Registration is open to campus members."}</p><button className="primary-button full" onClick={register} disabled={busy}>{busy ? "Please wait…" : "Register for event →"}</button><small>Sign-in required. Your registration is linked to your account.</small></aside>
      </section>}

      {screen === "registrations" && <><div className="section-heading"><div><span className="eyebrow">YOUR CAMPUS PLANS</span><h2>My registrations</h2><p className="muted">Events you’ve saved your place for.</p></div></div>{busy ? <LoadingState text="Loading registrations…" /> : registrations.length ? <div className="event-grid">{registrations.map((row, index) => { const related = row.events || row.event; const event = (Array.isArray(related) ? related[0] : related) || row; return <EventCard key={row.id || index} event={event} badge="Registered" onOpen={() => showEvent(event)} />; })}</div> : <EmptyState title="No registrations yet" text="Explore campus events and register for something you like." action="Explore events" onAction={() => navigate("events")} />}</>}

      {screen === "attendees" && <><div className="section-heading"><div><span className="eyebrow">ORGANIZER TOOLS</span><h2>Event attendees</h2><p className="muted">Attendee details are available only to the event’s organizer.</p></div></div>{events.length > 0 && <label className="event-select">Choose an event<select value={selectedEvent?.id || ""} onChange={(event) => { const choice = events.find((item) => String(item.id) === event.target.value); if (choice) loadAttendees(choice); }}>{events.map((event) => <option key={event.id} value={event.id}>{titleOf(event)}</option>)}</select></label>}{busy ? <LoadingState text="Loading attendee list…" /> : attendees.length ? <div className="table-wrap"><table><thead><tr><th>Attendee</th><th>Registration</th></tr></thead><tbody>{attendees.map((row, index) => <tr key={row.id || index}><td><span className="avatar small">{(row.user?.email || row.email || "S")[0].toUpperCase()}</span>{row.user?.email || row.email || `Student ${index + 1}`}</td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div> : !error && <EmptyState title="No attendees to show" text="Select one of your events. The API restricts this list to its organizer." />}</>}
      <footer className="footer"><span>Campus Connect</span><span>Discover. Show up. Belong.</span></footer>
    </main>
  </div>;
}

function AuthPage({ mode, setMode, onSubmit, busy, error, message }) {
  return <main className="auth-shell"><div className="auth-story"><a className="brand auth-brand" href="#"><span className="brand-mark">CC</span><span>Campus <b>Connect</b></span></a><span className="eyebrow">THE CAMPUS IS YOURS</span><h1>Your next<br /><em>chapter starts here.</em></h1><p>Find the events, communities, and moments that make college yours.</p><div className="story-badge"><span>✳</span><div><b>Good things happen together</b><small>Explore what’s happening around campus.</small></div></div><div className="story-orbit orbit-one"></div><div className="story-orbit orbit-two"></div></div>
    <section className="auth-panel"><div className="auth-card"><span className="eyebrow">WELCOME TO CAMPUS CONNECT</span><h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2><p className="muted">{mode === "login" ? "Sign in to pick up where campus life is happening." : "Use your email to join your campus community."}</p>
      <div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "signup" ? "selected" : ""} onClick={() => setMode("signup")}>Create account</button></div>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <form onSubmit={onSubmit} className="auth-form"><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@university.edu" required /></label><label>Password<input name="password" type="password" minLength="6" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 6 characters" required /></label><button className="primary-button full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}</button></form><p className="auth-foot">Secure sign-in powered by Supabase Auth.</p>
    </div></section>
  </main>;
}

function EventCard({ event, onOpen, badge }) {
  return <article className="event-card"><div className="event-card-art"><span>{event.category || "CAMPUS EVENT"}</span><b>{String(titleOf(event)).slice(0, 1).toUpperCase()}</b><span className="spark">✳</span></div><div className="event-card-body"><div className="card-meta"><span>◷ {formatDate(dateOf(event))}</span>{badge && <span className="status-pill">{badge}</span>}</div><h3>{titleOf(event)}</h3><p>{descriptionOf(event)}</p><div className="card-footer"><span>⌖ {placeOf(event)}</span><button onClick={onOpen}>View details <b>→</b></button></div></div></article>;
}

function Fact({ icon, label, value }) { return <div className="fact"><span className="fact-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>; }
function LoadingState({ text }) { return <div className="empty-state"><span className="loader"></span><p>{text}</p></div>; }
function EmptyState({ title, text, action, onAction }) { return <div className="empty-state"><span className="empty-icon">✳</span><h3>{title}</h3><p>{text}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>; }

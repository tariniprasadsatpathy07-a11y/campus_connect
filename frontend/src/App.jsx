import { useEffect, useMemo, useState } from "react";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "https://campus-connect-xtzl.onrender.com")
  .replace(/\/health\/?$/i, "")
  .replace(/\/$/, "");
const steps = ["Explore", "Event details"];
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

function getDemoDeviceId() {
  const key = "campus-connect-demo-device-id";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const [screen, setScreen] = useState("events");
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [deviceId] = useState(getDemoDeviceId);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All events");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function api(path, options = {}) {
    if (!apiBase) throw new Error("Set VITE_API_BASE_URL in frontend/.env.local first.");
    const headers = { "Content-Type": "application/json", ...options.headers };
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  async function loadDemoProfiles() {
    try {
      const [profilesPayload, preferencePayload] = await Promise.all([
        api("/api/demo-users"),
        api(`/api/demo-user?device_id=${encodeURIComponent(deviceId)}`),
      ]);
      const available = profilesPayload.data || [];
      setProfiles(available);
      const saved = preferencePayload.data?.demo_profile_id;
      const active = available.find((profile) => profile.id === saved) || available[0] || null;
      if (active) {
        setActiveProfile(active);
        if (active.id !== saved) await saveDemoProfile(active, false);
      }
    } catch (err) { setActiveProfile(null); setProfiles([]); setError(err.message); }
  }

  async function saveDemoProfile(profile, announce = true) {
    setError("");
    try {
      await api("/api/demo-user", {
        method: "PUT",
        body: JSON.stringify({ device_id: deviceId, demo_profile_id: profile.id }),
      });
      setActiveProfile(profile);
      setSwitchOpen(false);
      if (announce) setMessage(`Switched to ${profile.display_name}. This choice is saved in the database.`);
    } catch (err) { setError(err.message); }
  }

  async function createDemoProfile(event) {
    event.preventDefault();
    const display_name = newProfileName.trim();
    if (!display_name) return;
    setBusy(true); setError("");
    try {
      const payload = await api("/api/demo-users", {
        method: "POST",
        body: JSON.stringify({ display_name }),
      });
      const profile = payload.data;
      setProfiles((current) => [...current, profile].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setNewProfileName("");
      await saveDemoProfile(profile);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadEvents() {
    setError("");
    try {
      const payload = await api("/api/events?limit=100");
      setEvents(payload.data || []);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { loadEvents(); loadDemoProfiles(); }, []);

  async function showEvent(event) {
    setSelectedEvent(event); setScreen("detail"); setMessage(""); setError("");
    try {
      const payload = await api(`/api/events/${encodeURIComponent(event.id)}`);
      setSelectedEvent(payload.data || event);
    } catch (err) { setError(err.message); }
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
  }

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => navigate("events")}><span className="brand-mark">CC</span><span>Campus <b>Connect</b></span></button>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={screen === "events" || screen === "detail" ? "active" : ""} onClick={() => navigate("events")}>Explore events</button>
      </nav>
      <div className="account"><span className="avatar">{activeProfile?.display_name?.[0]?.toUpperCase() || "?"}</span><span className="account-email">{activeProfile?.display_name || "Demo profile"}</span><button className="text-button" aria-expanded={switchOpen} onClick={() => setSwitchOpen((open) => !open)}>Switch user</button>
        {switchOpen && <div className="switch-menu"><label>Choose a demo profile<select value={activeProfile?.id || ""} onChange={(event) => { const profile = profiles.find((item) => item.id === event.target.value); if (profile) saveDemoProfile(profile); }}><option value="" disabled>Select a profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></label><form onSubmit={createDemoProfile} className="new-profile-form"><label htmlFor="new-demo-profile">Add a demo profile</label><div><input id="new-demo-profile" maxLength="60" value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Enter a name" /><button className="secondary-button" disabled={busy || !newProfileName.trim()}>Add</button></div></form><small>Demo profiles are saved but do not verify a real person's identity.</small></div>}
      </div>
    </header>
    <main className="page-wrap">
      <div className="flow-steps" aria-label="App flow">{steps.map((step, index) => <span key={step} className={(screen === ["events", "detail"][index] ? "current " : "") + "flow-step"}><i>{index + 1}</i>{step}</span>)}</div>
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
        </div><aside className="register-card"><span className="eyebrow">SAVE YOUR SPOT</span><h3>Join the event</h3><p>{selectedEvent.capacity ? `${selectedEvent.capacity} spots available` : "Registration is open to campus members."}</p><button className="primary-button full" disabled>Real account sign-in required</button><small>A demo profile only saves your display choice. It cannot register as a real person.</small></aside>
      </section>}
      <footer className="footer"><span>Campus Connect</span><span>Discover. Show up. Belong.</span></footer>
    </main>
  </div>;
}

function EventCard({ event, onOpen, badge }) {
  return <article className="event-card"><div className="event-card-art"><span>{event.category || "CAMPUS EVENT"}</span><b>{String(titleOf(event)).slice(0, 1).toUpperCase()}</b><span className="spark">✳</span></div><div className="event-card-body"><div className="card-meta"><span>◷ {formatDate(dateOf(event))}</span>{badge && <span className="status-pill">{badge}</span>}</div><h3>{titleOf(event)}</h3><p>{descriptionOf(event)}</p><div className="card-footer"><span>⌖ {placeOf(event)}</span><button onClick={onOpen}>View details <b>→</b></button></div></div></article>;
}

function Fact({ icon, label, value }) { return <div className="fact"><span className="fact-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>; }
function LoadingState({ text }) { return <div className="empty-state"><span className="loader"></span><p>{text}</p></div>; }
function EmptyState({ title, text, action, onAction }) { return <div className="empty-state"><span className="empty-icon">✳</span><h3>{title}</h3><p>{text}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>; }

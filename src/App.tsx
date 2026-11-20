import { createContext, useContext, useEffect, useMemo, useState, type ChangeEventHandler, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight, Bell, Ban, Check, ChevronRight, ClipboardCheck, MapPin, Menu, PackageSearch,
  ShieldAlert, ShieldCheck, Smartphone, Wrench, X,
} from "lucide-react";
import { api, ApiError, errorMessage, type Catalog, type CurrentUser } from "./lib/api";

interface AuthContextValue {
  user: CurrentUser | null;
  theme: "light" | "dark";
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth context is missing.");
  return value;
};

export function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.localStorage.getItem("rejenga:theme") === "dark" ? "dark" : "light");

  const reload = async () => {
    const result = await api.get<{ user: CurrentUser | null }>("/api/session");
    setUser(result.user);
    setReady(true);
  };
  const signOut = async () => {
    await api.post("/api/auth/logout");
    setUser(null);
  };
  const toggleTheme = () => setTheme((current) => current === "light" ? "dark" : "light");
  useEffect(() => { void reload().catch(() => setReady(true)); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("rejenga:theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ user, theme, reload, signOut, toggleTheme }), [user, theme]);
  return (
    <AuthContext.Provider value={value}>
      {!ready ? <div className="loading-screen">ReJenga</div> : (
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/listings/new" element={<Protected roles={["donor"]}><NewListing /></Protected>} />
            <Route path="/requests/new" element={<Protected roles={["recipient"]}><NewRequest /></Protected>} />
            <Route path="/requests/:requestId/matches" element={<Protected roles={["recipient", "admin"]}><MatchesPage /></Protected>} />
            <Route path="/technician" element={<Protected roles={["technician", "admin"]}><TechnicianPage /></Protected>} />
            <Route path="/admin" element={<Protected roles={["admin"]}><AdminPage /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      )}
    </AuthContext.Provider>
  );
}

function SiteLayout() {
  const { user, signOut, theme, toggleTheme } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const leave = async () => { await signOut(); navigate("/login"); };
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="ReJenga home"><span className="brand-mark">R</span><span>ReJenga</span></Link>
        <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={menuOpen ? "site-nav open" : "site-nav"}>
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              {user.role === "technician" && <Link to="/technician">Inspections</Link>}
              {user.role === "admin" && <Link to="/admin">Admin</Link>}
              <span className="nav-user">{user.name}</span>
              <button className="button button-outline button-small" type="button" onClick={() => void leave()}>Sign out</button>
            </>
          ) : (
            <>
              <a href="#how-it-works">How it works</a>
              <Link to="/login" className="button button-outline button-small">Sign in</Link>
              <Link to="/auth?mode=register&redirect=%2Flistings%2Fnew" className="button button-copper button-small">Join the pilot</Link>
            </>
          )}
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Dark mode"
            title="Toggle dark mode"
          >
            <span>Dark mode</span>
            <span className="theme-switch" aria-hidden="true"><span className="theme-switch-thumb" /></span>
          </button>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <Link className="brand brand-dark" to="/"><span className="brand-mark">R</span><span>ReJenga</span></Link>
        <p>A Mount Kenya University computing project · Thika pilot</p>
        <span>Parts are suggestions, not guarantees.</span>
      </footer>
    </>
  );
}

function ButtonLink({ to, children, variant = "primary" }: { to: string; children: ReactNode; variant?: "primary" | "outline" | "light" }) {
  return <Link className={`button button-${variant}`} to={to}>{children}</Link>;
}

function Landing() {
  const { user } = useAuth();
  const steps = [
    { icon: Smartphone, title: "List a phone", body: "Share a supported device, what you know about its visible condition, and the parts that may be available." },
    { icon: PackageSearch, title: "Request a part", body: "Choose your phone model, the part you need, your approximate area and a short description." },
    { icon: ClipboardCheck, title: "Review explained matches", body: "See catalogue-compatible candidates ranked by inspection status and approximate area." },
    { icon: Wrench, title: "Technician checks it", body: "A technician records a physical inspection. You arrange any handover outside ReJenga." },
  ];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><MapPin size={15} /> Pilot around MKU, Thika</p>
          <h1>Your old phone has <em>parts</em> someone needs.</h1>
          <p className="hero-description">ReJenga connects reusable screens, batteries and charging boards with people who need a repair — and keeps a technician in the loop before any part changes hands.</p>
          <div className="hero-actions">
            <ButtonLink to={user ? "/listings/new" : "/auth?mode=register&redirect=%2Flistings%2Fnew"}>List a phone <ArrowRight size={17} /></ButtonLink>
            <ButtonLink to={user ? "/requests/new" : "/auth?mode=register&role=recipient&redirect=%2Frequests%2Fnew"} variant="light">Request a part</ButtonLink>
          </div>
          <p className="hero-note">A small community pilot. No payments, transport or repairs.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="phone phone-back"><div className="camera-row"><i /><i /><i /></div><div className="phone-screen" /></div>
          <div className="phone phone-front"><div className="phone-notch" /><div className="phone-screen"><div className="screen-line" /><div className="screen-line short" /><div className="screen-card" /><div className="screen-card small" /></div></div>
          <div className="tool tool-one" /><div className="tool tool-two" />
          <div className="floating-label"><span className="status-dot" /><div><b>Screen · candidate</b><small>Technician check required</small></div></div>
          <div className="art-stamp">REUSE<br />REPAIR<br />REJENGA</div>
        </div>
      </section>

      <section className="section steps-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>Four steps from drawer to repair.</h2>
        </div>
        <ol className="step-grid">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li className="step-card" key={title}>
              <span className="step-icon"><Icon size={22} /></span><span className="step-number">0{index + 1}</span>
              <h3>{title}</h3><p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section labels-section">
        <div className="labels-copy"><p className="eyebrow">Honest labels</p><h2>A match is a suggestion, not a guarantee.</h2>
          <p>Donor descriptions stay separate from technician findings. A catalogue rule can suggest fit; it cannot tell whether an internal component works.</p>
        </div>
        <div className="label-list">
          <Label icon={<Bell size={20} />} tone="warning" title="Not inspected yet">Donor-provided information only. A technician must check the part before any handover.</Label>
          <Label icon={<ShieldCheck size={20} />} tone="success" title="Technician-checked">A technician recorded condition and fit. This is not a warranty.</Label>
          <Label icon={<ShieldAlert size={20} />} tone="danger" title="Blocked: unsafe">Unsafe items, including damaged or swollen batteries, are excluded from matching.</Label>
        </div>
      </section>

      <section className="boundary">
        <div><p className="eyebrow">What ReJenga doesn't do</p><h2>You arrange the handover.<br />We keep the record.</h2></div>
        <ul>
          <li><Ban size={17} /> No payments or money handling</li>
          <li><Ban size={17} /> No transport or storage of devices</li>
          <li><Ban size={17} /> No repairs — technicians inspect, you decide</li>
          <li><Ban size={17} /> No guessing internal condition from photos</li>
        </ul>
      </section>
    </>
  );
}

function Label({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return <div className="label-card"><span className={`label-icon ${tone}`}>{icon}</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}

function Protected({ children, roles }: { children: ReactNode; roles?: CurrentUser["role"][] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AuthPage() {
  const { user, reload } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"donor" | "recipient">(params.get("role") === "recipient" ? "recipient" : "donor");
  const navigate = useNavigate();
  if (user) return <Navigate to="/dashboard" replace />;
  const continueToApp = async () => {
    await reload();
    const redirect = params.get("redirect");
    navigate(redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (mode === "register") {
        const result = await api.post<{ email: string }>("/api/auth/register", { ...data, role });
        setVerificationEmail(result.email);
        setNotice("We sent a six-digit verification code to your email.");
      } else {
        await api.post("/api/auth/login", data);
        await continueToApp();
      }
    } catch (cause) {
      if (mode === "register" && cause instanceof ApiError && cause.status === 503) setVerificationEmail(String(data.email ?? ""));
      setError(errorMessage(cause));
    }
    finally { setBusy(false); }
  };
  const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const code = new FormData(event.currentTarget).get("code");
    try {
      await api.post("/api/auth/verify-email", { email: verificationEmail, code });
      await continueToApp();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const resendCode = async (targetEmail: string) => {
    if (!targetEmail.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setError(""); setNotice(""); setBusy(true);
    try {
      await api.post("/api/auth/verification/resend", { email: targetEmail.trim() });
      setVerificationEmail(targetEmail.trim());
      setNotice("If this email has an account awaiting verification, a new code has been sent.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return (
    <div className="auth-page">
      <div className="auth-aside"><p className="eyebrow"><MapPin size={15} /> MKU · Thika pilot</p><h1>Better repairs begin with the right part.</h1><p>Join a small local pilot connecting device owners, donors and repair technicians.</p><div className="auth-safety"><ShieldCheck size={20} /><span>Every reserved part needs a physical technician check.</span></div></div>
      <section className="auth-card">
        {verificationEmail ? (
          <>
            <h2>Verify your email</h2>
            <p className="muted">Enter the six-digit code sent to <strong>{verificationEmail}</strong>. It expires in 15 minutes.</p>
            {notice && <p className="notice success-notice" role="status">{notice}</p>}
            {error && <p className="notice error-notice" role="alert">{error}</p>}
            <form className="form-stack" onSubmit={(event) => void verifyEmail(event)}>
              <label className="field"><span>Verification code</span><input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
              <button className="button button-primary full-width" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify email"} <ArrowRight size={16} /></button>
            </form>
            <div className="inline-actions">
              <button className="button button-outline button-small" type="button" disabled={busy} onClick={() => void resendCode(verificationEmail)}>Resend code</button>
              <button className="text-button" type="button" onClick={() => { setVerificationEmail(""); setMode("login"); setNotice(""); setError(""); }}>Back to sign in</button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setNotice(""); setError(""); }}>Sign in</button><button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setNotice(""); setError(""); }}>Create account</button></div>
            <h2>{mode === "login" ? "Welcome back" : "Join the pilot"}</h2>
            <p className="muted">{mode === "login" ? "Sign in to manage your listings, requests or checks." : "Verify your email to activate your donor or recipient account."}</p>
            {notice && <p className="notice success-notice" role="status">{notice}</p>}
            {error && <p className="notice error-notice" role="alert">{error}</p>}
            <form className="form-stack" onSubmit={(event) => void submit(event)}>
              {mode === "register" && <Field label="Your name" name="name" required minLength={2} autoComplete="name" />}
              <Field label="Email" name="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Field label="Password" name="password" type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} />
              {mode === "register" && <>
                <label className="field"><span>Account type</span><select value={role} onChange={(event) => setRole(event.target.value as "donor" | "recipient")}><option value="donor">I can donate parts</option><option value="recipient">I need a part</option></select></label>
                <Field label="Approximate area (town or neighbourhood)" name="area" required minLength={2} placeholder="e.g. MKU Thika" />
              </>}
              <button className="button button-primary full-width" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Send verification code"} <ArrowRight size={16} /></button>
            </form>
            {mode === "login" && <button className="text-button" type="button" disabled={busy} onClick={() => void resendCode(email)}>Resend verification code</button>}
            <p className="form-footnote">Technician access is assigned by an administrator. ReJenga never handles payments or transport.</p>
          </>
        )}
      </section>
    </div>
  );
}

function Field(props: { label: string; name: string; type?: string; required?: boolean; minLength?: number; placeholder?: string; autoComplete?: string; value?: string; onChange?: ChangeEventHandler<HTMLInputElement> }) {
  return <label className="field"><span>{props.label}</span><input name={props.name} type={props.type ?? "text"} required={props.required} minLength={props.minLength} placeholder={props.placeholder} autoComplete={props.autoComplete} value={props.value} onChange={props.onChange} /></label>;
}

interface Notice {
  id: string; title: string; body: string; readAt: string | null; createdAt: string;
}
interface Listing {
  id: string; description: string; area: string; status: string; brand: string; modelName: string; partName: string;
  donorCondition: string; safetyStatus: string; availability: string; donorName?: string; imageId?: string | null;
  classificationStatus?: "classified" | "unconfigured" | "failed" | null;
  predictionType?: "device_model" | "visible_damage" | null;
  predictedClass?: string | null;
  confidence?: number | null;
}
interface RepairRequest {
  id: string; description: string; area: string; status: string; brand: string; modelName: string; partName: string; recipientName?: string;
}
interface Match {
  id: string; status: string; outcome?: string | null; partName: string; brand: string; modelName: string;
  donorName: string; recipientName: string; requestArea: string; donorArea: string; imageId?: string | null;
}

function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children}</div>;
}
function ErrorBanner({ message }: { message: string }) {
  return message ? <p className="notice error-notice" role="alert">{message}</p> : null;
}
function Empty({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><PackageSearch size={25} /><h3>{title}</h3><p>{body}</p></div>;
}
function StatusPill({ children }: { children: ReactNode }) {
  const normalized = String(children).replaceAll("_", " ");
  const tone = ["accepted", "active", "approved", "completed", "cleared"].includes(normalized) ? "pill-green"
    : ["unsafe", "denied", "blocked", "moderated"].includes(normalized) ? "pill-red"
      : ["reserved", "pending", "not inspected yet", "unverified"].includes(normalized) ? "pill-amber" : "pill-neutral";
  return <span className={`status-pill ${tone}`}>{normalized}</span>;
}

function Dashboard() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [inspections, setInspections] = useState<Array<Record<string, string>>>([]);
  const [safetyChecks, setSafetyChecks] = useState<Array<Record<string, string>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const tasks: Promise<void>[] = [
      api.get<{ notifications: Notice[] }>("/api/notifications").then((result) => setNotifications(result.notifications)),
      api.get<{ matches: Match[] }>("/api/matches/mine").then((result) => setMatches(result.matches)),
    ];
    if (user.role === "donor" || user.role === "admin") {
      tasks.push(api.get<{ listings: Listing[] }>("/api/listings/mine").then((result) => setListings(result.listings)));
    }
    if (user.role === "recipient" || user.role === "admin") {
      tasks.push(api.get<{ requests: RepairRequest[] }>("/api/requests/mine").then((result) => setRequests(result.requests)));
    }
    if (user.role === "technician") {
      tasks.push(api.get<{ inspections: Array<Record<string, string>> }>("/api/inspections").then((result) => setInspections(result.inspections)));
      tasks.push(api.get<{ parts: Array<Record<string, string>> }>("/api/technician/safety-queue").then((result) => setSafetyChecks(result.parts)));
    }
    void Promise.all(tasks).catch((cause) => setError(errorMessage(cause)));
  }, [user]);

  const markRead = async (notice: Notice) => {
    await api.patch(`/api/notifications/${notice.id}/read`, {});
    setNotifications((items) => items.map((item) => item.id === notice.id ? { ...item, readAt: new Date().toISOString() } : item));
  };

  return (
    <div className="page-shell">
      <PageHeading eyebrow={`${user?.role} account · ${user?.area}`} title={`Good to see you, ${user?.name.split(" ")[0]}.`}>
        {user?.role === "donor" && <ButtonLink to="/listings/new">List a phone <ArrowRight size={16} /></ButtonLink>}
        {user?.role === "recipient" && <ButtonLink to="/requests/new">Request a part <ArrowRight size={16} /></ButtonLink>}
        {user?.role === "technician" && <ButtonLink to="/technician">Open inspections <ArrowRight size={16} /></ButtonLink>}
        {user?.role === "admin" && <ButtonLink to="/admin">Manage pilot <ArrowRight size={16} /></ButtonLink>}
      </PageHeading>
      <ErrorBanner message={error} />

      {(user?.role === "donor" || user?.role === "admin") && <section className="dashboard-section"><div className="section-title-row"><h2>{user.role === "admin" ? "Recent listings" : "Your listings"}</h2><span className="muted">{listings.length} listed part{listings.length === 1 ? "" : "s"}</span></div>
        {listings.length === 0 ? <Empty title="No phone listed yet" body="Create a listing to share which parts may be available for inspection." /> : <div className="record-list">{listings.slice(0, 8).map((listing) => <ListingCard key={`${listing.id}-${listing.partName}`} listing={listing} admin={user.role === "admin"} />)}</div>}
      </section>}

      {(user?.role === "recipient" || user?.role === "admin") && <section className="dashboard-section"><div className="section-title-row"><h2>{user.role === "admin" ? "Recent requests" : "Your requests"}</h2><span className="muted">{requests.length} request{requests.length === 1 ? "" : "s"}</span></div>
        {requests.length === 0 ? <Empty title="No part requested yet" body="Add the device model, needed part and approximate area to find catalogue-compatible candidates." /> : <div className="record-list">{requests.slice(0, 8).map((request) => <RequestCard key={request.id} request={request} admin={user.role === "admin"} />)}</div>}
      </section>}

      {user?.role === "technician" && <section className="dashboard-section"><div className="section-title-row"><h2>Technician queue</h2><Link to="/technician">Open queue <ChevronRight size={15} /></Link></div><p className="muted">Reserved parts need a physical inspection. Batteries require a safety check before they can be suggested.</p><div className="stat-card"><ClipboardCheck size={21} /><b>{inspections.length + safetyChecks.length}</b><span>checks waiting</span></div></section>}

      <section className="dashboard-section"><div className="section-title-row"><h2>Recent matches</h2><span className="muted">{matches.length} match{matches.length === 1 ? "" : "es"}</span></div>
        {matches.length === 0 ? <Empty title="No matches yet" body="Matches appear here after a recipient reserves an available, catalogue-compatible part." /> : <div className="record-list">{matches.slice(0, 8).map((match) => <MatchCard key={match.id} match={match} userRole={user?.role} />)}</div>}
      </section>

      <section className="dashboard-section"><div className="section-title-row"><h2>Notifications</h2><span className="muted">{notifications.filter((item) => !item.readAt).length} unread</span></div>
        {notifications.length === 0 ? <p className="muted">Updates about account status, matches and technician checks will appear here.</p> : <div className="notification-list">{notifications.slice(0, 8).map((notice) => <article className={notice.readAt ? "notification read" : "notification"} key={notice.id}><span className="notification-mark"><Bell size={16} /></span><div><h3>{notice.title}</h3><p>{notice.body}</p><small>{new Date(notice.createdAt).toLocaleString()}</small></div>{!notice.readAt && <button className="text-button" onClick={() => void markRead(notice)}>Mark read</button>}</article>)}</div>}
      </section>
    </div>
  );
}

function ListingCard({ listing, admin }: { listing: Listing; admin?: boolean }) {
  const [status, setStatus] = useState(listing.status);
  const [error, setError] = useState("");
  const toggle = async () => {
    const next = status === "active" ? "removed" : "active";
    try {
      await api.patch(`/api/listings/${listing.id}/status`, { status: next });
      setStatus(next);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <article className="record-card">{listing.imageId ? <img className="image-thumb" src={`/api/images/${listing.imageId}`} alt="Donor-provided device exterior; not proof of internal condition" /> : <div className="record-icon"><Smartphone size={20} /></div>}<div className="record-main"><div className="record-title"><h3>{listing.partName} · {listing.brand} {listing.modelName}</h3><StatusPill>{status}</StatusPill></div><p>{listing.donorCondition}</p><p className="record-meta"><MapPin size={13} /> {listing.area} <span>·</span> <StatusPill>{listing.safetyStatus}</StatusPill> <StatusPill>{listing.availability}</StatusPill></p><ClassificationNote status={listing.classificationStatus} predictionType={listing.predictionType} predictedClass={listing.predictedClass} confidence={listing.confidence} />{admin && <small>Donor: {listing.donorName}</small>}{error && <small className="error-text">{error}</small>}</div>
    {!admin && status === "active" && <button className="button button-outline button-small" onClick={() => void toggle()} disabled={listing.availability !== "available"}>Remove</button>}
  </article>;
}

function ClassificationNote({ status, predictionType, predictedClass, confidence }: {
  status?: "classified" | "unconfigured" | "failed" | null;
  predictionType?: "device_model" | "visible_damage" | null;
  predictedClass?: string | null;
  confidence?: number | null;
}) {
  if (!status) return null;
  if (status === "classified" && predictedClass) {
    const category = predictionType === "device_model" ? "model" : "visible damage";
    const score = typeof confidence === "number" ? ` · ${Math.round(confidence * 100)}% confidence` : "";
    const lowConfidence = typeof confidence === "number" && confidence < 0.6;
    return <p className={lowConfidence ? "ai-note ai-low-confidence" : "ai-note"}><b>Advisory AI · {category}{lowConfidence ? " · low confidence" : ""}:</b> {predictedClass}{score}. Unverified; it cannot establish part safety or internal condition.</p>;
  }
  return <p className="ai-note">{status === "unconfigured" ? "AI image classification is not configured; no prediction was made."
    : "The local image classifier did not return a valid prediction."} Donor-entered details remain unverified.</p>;
}

function RequestCard({ request, admin }: { request: RepairRequest; admin?: boolean }) {
  const [status, setStatus] = useState(request.status);
  const [error, setError] = useState("");
  const cancel = async () => {
    setError("");
    try { await api.patch(`/api/requests/${request.id}/status`, { status: "cancelled" }); setStatus("cancelled"); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  return <article className="record-card"><div className="record-icon request-icon"><PackageSearch size={20} /></div><div className="record-main"><div className="record-title"><h3>{request.partName} · {request.brand} {request.modelName}</h3><StatusPill>{status}</StatusPill></div><p>{request.description}</p><p className="record-meta"><MapPin size={13} /> {request.area}{admin && <span> · {request.recipientName}</span>}</p></div>
    {status === "open" && !admin && <div className="request-actions"><ButtonLink to={`/requests/${request.id}/matches`} variant="outline">Find parts <ChevronRight size={15} /></ButtonLink><button className="text-button" onClick={() => void cancel()}>Cancel request</button></div>}
    {error && <small className="error-text">{error}</small>}
  </article>;
}

function MatchCard({ match, userRole }: { match: Match; userRole?: CurrentUser["role"] }) {
  const [status, setStatus] = useState(match.status);
  const [error, setError] = useState("");
  const outcome = async (value: "completed" | "declined" | "expired") => {
    try {
      await api.post(`/api/matches/${match.id}/outcome`, { outcome: value });
      setStatus(value);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <article className="record-card">{match.imageId ? <img className="image-thumb" src={`/api/images/${match.imageId}`} alt="Donor-provided device exterior; not proof of internal condition" /> : <div className="record-icon"><ClipboardCheck size={20} /></div>}<div className="record-main"><div className="record-title"><h3>{match.partName} · {match.brand} {match.modelName}</h3><StatusPill>{status}</StatusPill></div><p>Donor: {match.donorName} · Requester: {match.recipientName}</p><p className="record-meta"><MapPin size={13} /> {match.donorArea} <span>·</span> {match.requestArea}</p>{status === "reserved" && userRole === "recipient" && <div className="inline-actions"><button className="button button-outline button-small" onClick={() => void outcome("declined")}>Cancel reservation</button><button className="text-button" onClick={() => void outcome("expired")}>Mark expired</button></div>}{status === "accepted" && userRole === "recipient" && <div className="inline-actions"><button className="button button-primary button-small" onClick={() => void outcome("completed")}>Record handover</button><button className="button button-outline button-small" onClick={() => void outcome("declined")}>Declined</button><button className="text-button" onClick={() => void outcome("expired")}>Expired</button></div>}{error && <small className="error-text">{error}</small>}</div></article>;
}

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api.get<Catalog>("/api/catalog").then(setCatalog).catch((cause) => setError(errorMessage(cause))); }, []);
  return { catalog, error };
}

function NewListing() {
  const { catalog, error: catalogError } = useCatalog();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [parts, setParts] = useState<Array<{ partTypeId: string; condition: string }>>([{ partTypeId: "", condition: "" }]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const selected = parts.filter((part) => part.partTypeId && part.condition.trim());
    if (selected.length === 0) { setError("Choose at least one part and describe what you know about it."); return; }
    form.set("parts", JSON.stringify(selected));
    try {
      const result = await api.post<{ classification: { status: "classified" | "unconfigured" | "failed"; predictionType: "device_model" | "visible_damage" | null; predictedClass: string | null; confidence: number | null } | null }>("/api/listings", form);
      if (result.classification?.status === "classified" && result.classification.predictedClass) {
        const type = result.classification.predictionType === "device_model" ? "model" : "visible damage";
        setNotice(`Listing saved. Advisory AI ${type} suggestion: ${result.classification.predictedClass} (${Math.round((result.classification.confidence ?? 0) * 100)}% confidence). It is unverified; a technician must inspect the part.`);
      } else if (result.classification?.status === "unconfigured") {
        setNotice("Listing saved. Image classification is not configured; the model and visible condition remain donor-provided and unverified.");
      } else if (result.classification?.status === "failed") {
        setNotice("Listing saved. The local classifier did not return a valid prediction; no AI result is available.");
      } else {
        setNotice("Listing saved. A technician must inspect the part before any handover.");
      }
      window.setTimeout(() => navigate("/dashboard"), 1600);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <div className="page-shell form-page"><PageHeading eyebrow="Donor · new listing" title="List a device for inspection." /><p className="page-intro">Describe only what you know. Listing a part does not certify its condition or safety; do not disassemble a device to create a listing.</p><ErrorBanner message={catalogError || error} />
    <form className="panel form-stack" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>Supported phone model</span><select name="modelId" required defaultValue=""><option value="" disabled>Select a model</option>{catalog?.models.map((model) => <option value={model.id} key={model.id}>{model.brand} {model.modelName}</option>)}</select></label>
      <Field label="Approximate area (town or neighbourhood)" name="area" required minLength={2} placeholder="e.g. MKU Thika" />
      <label className="field"><span>Device description</span><textarea name="description" rows={3} required minLength={3} maxLength={1000} placeholder="What should a technician know about the device?" /></label>
      <div className="form-divider"><div><h3>Parts that may be available</h3><p>These are donor descriptions, not an inspection result.</p></div><button className="button button-outline button-small" type="button" onClick={() => setParts((items) => [...items, { partTypeId: "", condition: "" }])}>Add a part</button></div>
      {parts.map((part, index) => <div className="part-entry" key={index}><label className="field"><span>Part type</span><select required value={part.partTypeId} onChange={(event) => setParts((items) => items.map((item, i) => i === index ? { ...item, partTypeId: event.target.value } : item))}><option value="" disabled>Select a part</option>{catalog?.parts.map((item) => <option key={item.id} value={item.id}>{item.partName}</option>)}</select></label><label className="field"><span>What you know about it</span><input required minLength={2} maxLength={500} placeholder="e.g. visible marks; internal condition unknown" value={part.condition} onChange={(event) => setParts((items) => items.map((item, i) => i === index ? { ...item, condition: event.target.value } : item))} /></label>{parts.length > 1 && <button className="icon-button" aria-label="Remove part" type="button" onClick={() => setParts((items) => items.filter((_, i) => i !== index))}><X size={17} /></button>}</div>)}
      <label className="field"><span>Optional device photo <small>(JPEG, PNG or WebP; up to 5 MB)</small></span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <p className="privacy-note"><ShieldCheck size={17} /> Photos stay in ReJenga’s local database. If a local model is configured, its prediction is advisory only and cannot determine internal part health.</p>
      {notice && <p className="notice success-notice">{notice}</p>}<button className="button button-primary" type="submit">Save listing <ArrowRight size={16} /></button>
    </form>
  </div>;
}

function NewRequest() {
  const { catalog, error: catalogError } = useCatalog();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api.post<{ id: string }>("/api/requests", data);
      navigate(`/requests/${result.id}/matches`);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <div className="page-shell form-page"><PageHeading eyebrow="Recipient · new request" title="Tell us what you need." /><p className="page-intro">Choose the device and part from the supported catalogue. ReJenga can suggest candidates but cannot confirm a part will work.</p><ErrorBanner message={catalogError || error} />
    <form className="panel form-stack" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>Your phone model</span><select name="modelId" required defaultValue=""><option value="" disabled>Select a model</option>{catalog?.models.map((model) => <option key={model.id} value={model.id}>{model.brand} {model.modelName}</option>)}</select></label>
      <label className="field"><span>Part needed</span><select name="partTypeId" required defaultValue=""><option value="" disabled>Select a part</option>{catalog?.parts.map((part) => <option key={part.id} value={part.id}>{part.partName}</option>)}</select></label>
      <Field label="Approximate area (town or neighbourhood)" name="area" required minLength={2} placeholder="e.g. MKU Thika" />
      <label className="field"><span>Describe the repair need</span><textarea name="description" rows={4} required minLength={3} maxLength={1000} placeholder="What is the problem and what part are you looking for?" /></label>
      <p className="privacy-note"><MapPin size={17} /> ReJenga uses only an approximate area. It does not collect continuous GPS location.</p>
      <button className="button button-primary" type="submit">Save request and find parts <ArrowRight size={16} /></button>
    </form>
  </div>;
}

interface Candidate {
  id: string; part_name: string; brand: string; model_name: string; donor_condition: string; donor_area: string;
  inspection_status: string; donor_name: string; reasons: string[];
  classification_status: "classified" | "unconfigured" | "failed" | null;
  prediction_type: "device_model" | "visible_damage" | null; predicted_class: string | null; confidence: number | null;
}
function MatchesPage() {
  const { requestId = "" } = useParams();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => api.get<{ candidates: Candidate[] }>(`/api/requests/${requestId}/matches`).then((result) => setCandidates(result.candidates));
  useEffect(() => { void load().catch((cause) => setError(errorMessage(cause))); }, [requestId]);
  const reserve = async (candidate: Candidate) => {
    setError(""); setMessage(""); setBusy(candidate.id);
    try {
      await api.post("/api/matches/reserve", { requestId, listingPartId: candidate.id });
      setMessage("Part reserved for a technician inspection. You’ll see updates on your dashboard.");
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(""); }
  };
  return <div className="page-shell"><PageHeading eyebrow="Catalogue suggestions" title="Potential parts for your request." /><p className="page-intro">Matches use the active compatibility catalogue, availability and approximate areas. A reservation is not a confirmation: a technician must inspect it first.</p><ErrorBanner message={error} />{message && <p className="notice success-notice">{message}</p>}
    {candidates.length === 0 ? <Empty title="No available candidates yet" body="Your request stays open. It will not be matched to unavailable, unsafe, incompatible or rejected parts." /> : <div className="candidate-list">{candidates.map((candidate) => <article className="candidate-card" key={candidate.id}><div className="candidate-heading"><div className="record-icon"><Smartphone size={20} /></div><div><p className="eyebrow">{candidate.brand} {candidate.model_name}</p><h2>{candidate.part_name}</h2><p className="muted">Donor: {candidate.donor_name} · {candidate.donor_area}</p></div><StatusPill>{candidate.inspection_status === "checked" ? "checked" : "not inspected yet"}</StatusPill></div><p>{candidate.donor_condition}</p><ClassificationNote status={candidate.classification_status} predictionType={candidate.prediction_type} predictedClass={candidate.predicted_class} confidence={candidate.confidence} /><ul className="reason-list">{candidate.reasons.map((reason) => <li key={reason}><Check size={14} /> {reason}</li>)}</ul><button className="button button-primary" disabled={Boolean(busy)} onClick={() => void reserve(candidate)}>{busy === candidate.id ? "Reserving…" : "Reserve for technician check"} <ArrowRight size={16} /></button></article>)}</div>}
  </div>;
}

function TechnicianPage() {
  const [inspections, setInspections] = useState<Array<{ matchId: string; status: string; partName: string; brand: string; modelName: string; donorCondition: string; requestDescription: string; requestArea: string; donorArea: string; donorName: string; recipientName: string; imageId: string | null }>>([]);
  const [safetyChecks, setSafetyChecks] = useState<Array<{ listingPartId: string; partName: string; brand: string; modelName: string; donorCondition: string; area: string; donorName: string; imageId: string | null }>>([]);
  const [error, setError] = useState("");
  const load = () => Promise.all([
    api.get<{ inspections: typeof inspections }>("/api/inspections").then((result) => setInspections(result.inspections)),
    api.get<{ parts: typeof safetyChecks }>("/api/technician/safety-queue").then((result) => setSafetyChecks(result.parts)),
  ]);
  useEffect(() => { void load().catch((cause) => setError(errorMessage(cause))); }, []);
  return <div className="page-shell"><PageHeading eyebrow="Technician workspace" title="Physical inspection queue." /><p className="page-intro">Record what you physically observed. An accepted check is not a warranty. Unsafe items must be blocked and must not be handed over.</p><ErrorBanner message={error} />
    {safetyChecks.length > 0 && <section className="dashboard-section"><div className="section-title-row"><h2>Battery safety checks</h2><span className="muted">Unverified batteries are never suggested</span></div><div className="inspection-list">{safetyChecks.map((part) => <SafetyCheckCard key={part.listingPartId} part={part} onSaved={() => void load()} />)}</div></section>}
    <section className="dashboard-section"><div className="section-title-row"><h2>Reserved-part inspections</h2><span className="muted">{inspections.length} waiting</span></div>{inspections.length === 0 ? <Empty title="No parts waiting for inspection" body="When a recipient reserves a catalogue-compatible part, it appears here." /> : <div className="inspection-list">{inspections.map((inspection) => <InspectionCard key={inspection.matchId} inspection={inspection} onSaved={() => void load()} />)}</div>}</section>
  </div>;
}

function SafetyCheckCard({ part, onSaved }: { part: { listingPartId: string; partName: string; brand: string; modelName: string; donorCondition: string; area: string; donorName: string; imageId: string | null }; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"cleared" | "rejected" | "unsafe">("cleared");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await api.post(`/api/listing-parts/${part.listingPartId}/safety-check`, { ...values, decision }); onSaved(); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  return <article className="inspection-card"><div className="inspection-summary">{part.imageId && <img className="inspection-image" src={`/api/images/${part.imageId}`} alt="Donor-provided battery exterior; not proof of internal condition" />}<p className="eyebrow">{part.brand} {part.modelName} · {part.partName}</p><h2>{part.donorName} · {part.area}</h2><p><b>Donor says:</b> {part.donorCondition}</p><p className="privacy-note"><ShieldAlert size={16} /> Check for damage or swelling. If unsafe, do not handle; direct the donor to qualified assistance.</p></div><form className="inspection-form" onSubmit={(event) => void submit(event)}><label className="field"><span>Observed condition</span><input name="observedCondition" required minLength={2} maxLength={500} /></label><label className="field"><span>Safety decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="cleared">Cleared for matching (not a warranty)</option><option value="rejected">Reject listing</option><option value="unsafe">Block as unsafe</option></select></label><label className="field"><span>Notes (optional)</span><textarea name="notes" rows={2} maxLength={1000} /></label>{decision === "unsafe" && <p className="notice error-notice">This battery is permanently blocked from matching.</p>}<ErrorBanner message={error} /><button className={`button ${decision === "unsafe" ? "button-danger" : "button-primary"}`}>Save safety check</button></form></article>;
}

function InspectionCard({ inspection, onSaved }: { inspection: { matchId: string; partName: string; brand: string; modelName: string; donorCondition: string; requestDescription: string; requestArea: string; donorArea: string; donorName: string; recipientName: string; imageId: string | null }; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"accepted" | "rejected" | "unsafe">("accepted");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await api.post(`/api/matches/${inspection.matchId}/inspection`, { ...values, decision }); onSaved(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <article className="inspection-card"><div className="inspection-summary">{inspection.imageId && <img className="inspection-image" src={`/api/images/${inspection.imageId}`} alt="Donor-provided device exterior; not proof of internal condition" />}<p className="eyebrow">{inspection.brand} {inspection.modelName} · {inspection.partName}</p><h2>Donor: {inspection.donorName} · Requester: {inspection.recipientName}</h2><p><b>Donor says:</b> {inspection.donorCondition}</p><p><b>Request:</b> {inspection.requestDescription}</p><p className="record-meta"><MapPin size={13} /> {inspection.donorArea} · {inspection.requestArea}</p></div><form className="inspection-form" onSubmit={(event) => void submit(event)}><label className="field"><span>Observed physical condition</span><input name="observedCondition" required minLength={2} maxLength={500} /></label><label className="field"><span>Fit for the requested model</span><select name="fit" required><option value="fits">Fits</option><option value="does_not_fit">Does not fit</option><option value="uncertain">Uncertain</option></select></label><label className="field"><span>Inspection decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="accepted">Accept: fits and condition is suitable</option><option value="rejected">Reject: unsuitable or does not fit</option><option value="unsafe">Block: unsafe item</option></select></label><label className="field"><span>Notes (optional)</span><textarea name="notes" rows={2} maxLength={1000} /></label>{decision === "unsafe" && <p className="notice error-notice">This blocks the part from all future matches.</p>}<ErrorBanner message={error} /><button className={`button ${decision === "unsafe" ? "button-danger" : "button-primary"}`} disabled={busy}>{busy ? "Saving…" : "Save inspection"}</button></form></article>;
}

function AdminPage() {
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string; status: string; area: string }>>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<{ models: Array<{ id: string; brand: string; modelName: string; active: number }>; parts: Array<{ id: string; partName: string; active: number }>; rules: Array<{ id: string; source: string; active: number; donorBrand: string; donorModel: string; recipientBrand: string; recipientModel: string; partName: string }> } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((value) => value + 1);
  useEffect(() => {
    void Promise.all([
      api.get<{ users: typeof users }>("/api/admin/users").then((result) => setUsers(result.users)),
      api.get<{ listings: Listing[] }>("/api/admin/listings").then((result) => setListings(result.listings)),
      api.get<{ totals: Record<string, number> }>("/api/admin/reports").then((result) => setReports(result.totals)),
      api.get<typeof catalog>("/api/admin/catalog").then(setCatalog),
    ]).catch((cause) => setError(errorMessage(cause)));
  }, [refresh]);
  const updateRole = async (target: typeof users[number], role: "technician" | "donor" | "recipient") => {
    try { await api.patch(`/api/admin/users/${target.id}`, { role }); reload(); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const deny = async (target: typeof users[number]) => {
    try { await api.patch(`/api/admin/users/${target.id}`, { status: "denied" }); reload(); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  return <div className="page-shell"><PageHeading eyebrow="Administrator workspace" title="Manage the pilot." /><ErrorBanner message={error} />
    <section className="dashboard-section"><h2>Activity snapshot</h2><div className="metrics-grid">{Object.entries(reports).map(([name, count]) => <div className="metric-card" key={name}><span>{name.replaceAll(/([A-Z])/g, " $1")}</span><b>{count}</b></div>)}</div></section>
    <section className="dashboard-section"><div className="section-title-row"><h2>Email verification</h2><span className="muted">{users.filter((item) => item.status === "pending").length} awaiting verification</span></div><p className="muted">Donor and recipient accounts become active automatically when their owner verifies their email. No administrator approval is required.</p><div className="record-list">{users.filter((item) => item.status === "pending").map((target) => <article className="record-card admin-user" key={target.id}><div className="record-main"><h3>{target.name}</h3><p>{target.email} · {target.area} · requested {target.role}</p><StatusPill>{target.status}</StatusPill></div><button className="button button-outline button-small" onClick={() => void deny(target)}>Deny</button></article>)}</div></section>
    <section className="dashboard-section"><div className="section-title-row"><h2>Technician access</h2></div><p className="muted">Verified users can use their donor or recipient account immediately. Assign technician access only when appropriate.</p><div className="record-list">{users.filter((item) => item.status === "approved" && item.role !== "admin").map((target) => <article className="record-card admin-user" key={target.id}><div className="record-main"><h3>{target.name}</h3><p>{target.email} · {target.area}</p></div><select aria-label={`Role for ${target.name}`} value={target.role} onChange={(event) => void updateRole(target, event.target.value as "technician" | "donor" | "recipient")}><option value="donor">Donor</option><option value="recipient">Recipient</option><option value="technician">Technician</option></select></article>)}</div></section>
    <CatalogManager catalog={catalog} refresh={reload} onError={setError} />
    <section className="dashboard-section"><div className="section-title-row"><h2>Listing moderation</h2><span className="muted">{listings.length} listed parts</span></div><div className="record-list">{listings.slice(0, 30).map((listing) => <AdminListing key={`${listing.id}-${listing.partName}`} listing={listing} onSaved={reload} onError={setError} />)}</div></section>
  </div>;
}

function AdminListing({ listing, onSaved, onError }: { listing: Listing; onSaved: () => void; onError: (message: string) => void }) {
  const [status, setStatus] = useState(listing.status);
  const change = async (next: "active" | "moderated" | "removed") => {
    try { await api.patch(`/api/admin/listings/${listing.id}`, { status: next }); setStatus(next); onSaved(); }
    catch (cause) { onError(errorMessage(cause)); }
  };
  return <article className="record-card"><div className="record-main"><div className="record-title"><h3>{listing.brand} {listing.modelName} · {listing.partName}</h3><StatusPill>{status}</StatusPill></div><p>{listing.donorName} · {listing.area} · {listing.availability}</p></div><button className="button button-outline button-small" onClick={() => void change(status === "moderated" ? "active" : "moderated")}>{status === "moderated" ? "Restore" : "Moderate"}</button></article>;
}

function CatalogManager({ catalog, refresh, onError }: { catalog: AdminPageCatalog; refresh: () => void; onError: (message: string) => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>, endpoint: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try { await api.post(endpoint, values); form.reset(); refresh(); }
    catch (cause) { onError(errorMessage(cause)); }
  };
  return <section className="dashboard-section"><h2>Supported catalogue</h2><p className="muted">Only administrator-maintained compatibility rules can produce candidates. The rule source is shown in each match.</p>
    <div className="catalog-grid">
      <form className="panel form-stack compact-form" onSubmit={(event) => void submit(event, "/api/admin/models")}><h3>Add supported model</h3><Field label="Brand" name="brand" required minLength={2} /><Field label="Model" name="modelName" required /><button className="button button-primary button-small">Add model</button></form>
      <form className="panel form-stack compact-form" onSubmit={(event) => void submit(event, "/api/admin/parts")}><h3>Add part type</h3><Field label="Part type" name="partName" required minLength={2} /><button className="button button-primary button-small">Add part</button></form>
      <form className="panel form-stack compact-form" onSubmit={(event) => void submit(event, "/api/admin/rules")}><h3>Add compatibility rule</h3><label className="field"><span>Donor model</span><select name="donorModelId" required defaultValue=""><option value="" disabled>Select</option>{catalog?.models.map((model) => <option value={model.id} key={model.id}>{model.brand} {model.modelName}</option>)}</select></label><label className="field"><span>Recipient model</span><select name="recipientModelId" required defaultValue=""><option value="" disabled>Select</option>{catalog?.models.map((model) => <option value={model.id} key={model.id}>{model.brand} {model.modelName}</option>)}</select></label><label className="field"><span>Part type</span><select name="partTypeId" required defaultValue=""><option value="" disabled>Select</option>{catalog?.parts.map((part) => <option value={part.id} key={part.id}>{part.partName}</option>)}</select></label><Field label="Source / technician reference" name="source" required minLength={3} /><button className="button button-primary button-small">Add rule</button></form>
    </div>
    <div className="rule-list"><h3>Active rules</h3>{catalog?.rules.map((rule) => <div className="rule-row" key={rule.id}><span>{rule.donorBrand} {rule.donorModel} → {rule.recipientBrand} {rule.recipientModel} · {rule.partName}<small>{rule.source}</small></span><StatusPill>{rule.active ? "active" : "inactive"}</StatusPill><button className="text-button" onClick={async () => { try { await api.patch(`/api/admin/rules/${rule.id}`, { active: !rule.active }); refresh(); } catch (cause) { onError(errorMessage(cause)); } }}>{rule.active ? "Deactivate" : "Activate"}</button></div>)}</div>
  </section>;
}
type AdminPageCatalog = { models: Array<{ id: string; brand: string; modelName: string; active: number }>; parts: Array<{ id: string; partName: string; active: number }>; rules: Array<{ id: string; source: string; active: number; donorBrand: string; donorModel: string; recipientBrand: string; recipientModel: string; partName: string }> } | null;

function NotFound() {
  return <div className="page-shell not-found"><Ban size={30} /><h1>That page isn’t here.</h1><p>Return to the landing page or open your dashboard.</p><ButtonLink to="/">Go home <ArrowRight size={16} /></ButtonLink></div>;
}

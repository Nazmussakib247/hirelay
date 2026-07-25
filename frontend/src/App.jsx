import { useState, useEffect, useCallback, useRef } from "react";
import Analytics from "./Analytics.jsx";

// ── Token store (sessionStorage-backed: survives reload, cleared on tab close)
// Token store lives in a typed module. Import for local use in this file AND
// re-export so sibling files (e.g. Analytics.jsx) keep importing from App.
import { getToken, setToken, clearToken } from "./auth/token";
export { getToken, setToken, clearToken };

// ── JWT decode — extracted to a shared util (decomposition phase 2) ─────
import { decodeJWT } from "./lib/jwt";

// Authenticated fetch wrapper — implemented in a typed module (src/api/client.ts).
import { api } from "./api/client";

/* ─── AUTH CONTEXT (extracted to ./auth/context — decomposition phase 2) ─
   The App root provides AuthContext; every feature component consumes it via
   useAuth() from its own module, so nothing imports App (no import cycle). */
import { AuthContext } from "./auth/context";

/* ─── SHARED UI (extracted modules — frontend decomposition phase 1) ──── */
import { T, Icon, GLOBAL_CSS } from "./ui/foundation";
// App root only needs a few primitives directly; feature modules import the rest.
import { Badge, Logo, Card } from "./ui/primitives";
import { ForceChangePasswordModal } from "./features/auth/ForceChangePasswordModal";
import { InterviewsTab } from "./features/interviews/InterviewsTab";

/* ─── STATS BAR (extracted to ./layout/StatsBar — decomposition phase 2) ─ */
import { StatsBar } from "./layout/StatsBar";

/* ─── CV UPLOAD ───────────────────────────────────────────────────────── */
/* UploadZone extracted to ./features/upload/UploadZone — decomposition phase 4 */
import { UploadZone } from "./features/upload/UploadZone";

/* MatchPanel extracted to ./features/matching/MatchPanel — decomposition phase 4 */
import { MatchPanel } from "./features/matching/MatchPanel";

/* ─── JOB POSTING TAB (extracted to ./features/posting/JobPostingTab) ───── */
import { JobPostingTab } from "./features/posting/JobPostingTab";

/* ─── CANDIDATES TAB (extracted to ./features/candidates/CandidatesTab) ─── */
import { CandidatesTab } from "./features/candidates/CandidatesTab";


/* ─── JOBS TAB (extracted to ./features/jobs/JobsTab — phase 3) ────────────
   The jobs feature — skillsToPayload/jobToSkillList helpers, SkillWeightEditor,
   JobSkillsEditor and JobsTab — now lives in its own module. */
import { JobsTab } from "./features/jobs/JobsTab";

/* ─── EVALUATION TAB (extracted to ./features/evaluation/EvaluationTab) ─── */
import { EvaluationTab } from "./features/evaluation/EvaluationTab";

/* ─── NAVIGATION ──────────────────────────────────────────────────────── */
const TABS = [
  { id: "upload",     label: "CV Upload",   icon: Icon.fileText,  group: "Recruiting" },
  { id: "match",      label: "AI Match",    icon: Icon.target,    group: "Recruiting" },
  { id: "posting",    label: "Job Posting", icon: Icon.megaphone, group: "Recruiting" },
  { id: "interviews", label: "Interviews",  icon: Icon.calendar,  group: "Recruiting" },
  { id: "candidates", label: "Candidates",  icon: Icon.user,      group: "Manage"     },
  { id: "jobs",       label: "Jobs",        icon: Icon.briefcase, group: "Manage"     },
  { id: "analytics",  label: "Analytics",   icon: Icon.chart,     group: "Insights"   },
  { id: "evaluation", label: "Evaluation",  icon: Icon.flask,     group: "Insights"   },
];
const NAV_GROUPS = ["Recruiting", "Manage", "Insights"];

const TAB_DESC = {
  upload:     "Upload CVs (PDF or DOCX) — AI automatically extracts name, skills, experience, and education",
  match:      "Run AI matching against a job — shortlisted candidates automatically receive interview invitations",
  posting:    "Broadcast job listings to LinkedIn, Telegram, Bdjobs, X/Twitter, or a custom webhook",
  interviews: "View scheduled interviews and monitor email delivery logs",
  candidates: "Browse all candidates, filter by status, review AI analysis, and resend communications",
  jobs:       "Create and manage your open job positions",
  analytics:  "Full recruiting pipeline analytics — funnel metrics, score distribution, top skills, and job performance",
  evaluation: "Benchmark the matching engine — seed a 50-sample labelled dataset, run evaluation, view Accuracy / Precision / Recall / F1, confusion matrix, 6-config ablation study, and per-CV results",
};

/* ══════════════════════════════════════════════════════════════════════════
   PART 2 — AUTH COMPONENTS
   ══════════════════════════════════════════════════════════════════════════ */

/* UserMenu extracted to ./layout/UserMenu — decomposition phase 2
   (UserMenu renders the RoleBadge itself, so App no longer imports it.) */
import { UserMenu } from "./layout/UserMenu";

/* RegisterModal extracted to ./auth/RegisterModal — decomposition phase 2 */
import { RegisterModal } from "./auth/RegisterModal";

/* ─── EDIT PROFILE MODAL ─────────────────────────────────────────────── */
/* ProfileModal extracted to ./auth/ProfileModal — decomposition phase 2 */
import { ProfileModal } from "./auth/ProfileModal";

/* ─── LOGIN PAGE ─────────────────────────────────────────────────────── */
/* ─── NOTIFICATION BELL ───────────────────────────────────────────────── */
/* NotificationBell extracted to ./notifications/NotificationBell — phase 2 */
import { NotificationBell } from "./notifications/NotificationBell";

/* LoginPage extracted to ./auth/LoginPage — decomposition phase 2 */
import { LoginPage } from "./auth/LoginPage";

/* ─── SIDEBAR NAV ITEM ────────────────────────────────────────────────── */
/* NavItem extracted to ./layout/NavItem — decomposition phase 2 */
import { NavItem } from "./layout/NavItem";

/* ─── APP ROOT ────────────────────────────────────────────────────────── */
export default function App() {
  const [tab,     setTab]     = useState("upload");
  const [stats,   setStats]   = useState(null);
  const [jobs,    setJobs]    = useState([]);
  const [key,     setKey]     = useState(0);
  const [navOpen, setNavOpen] = useState(true);
  const sidebarW = navOpen ? 232 : 68;
  // Persists across renders (unlike a plain let) so scheduleExpiry can clear
  // a previously scheduled timer instead of leaking one on every login.
  const refreshTimerRef = useRef(null);

  // ── Auth state ────────────────────────────────────────────────────────
  const [authed,      setAuthed]      = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showRegModal,     setShowRegModal]     = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const onUnauthed = useCallback(() => { setAuthed(false); setCurrentUser(null); }, []);

  // ── Schedule proactive logout 5 min before token expiry ───────────────
  const scheduleExpiry = useCallback((token) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const payload = decodeJWT(token);
    if (!payload?.exp) return;
    const msLeft    = payload.exp * 1000 - Date.now();
    const warnAt    = Math.max(msLeft - 5 * 60 * 1000, 10_000);
    refreshTimerRef.current = setTimeout(() => {
      clearToken();
      setAuthed(false);
      setCurrentUser(null);
    }, warnAt);
  }, []);

  const handleLogin = useCallback((token, user) => {
    setToken(token);
    setAuthed(true);
    setCurrentUser(user);
    scheduleExpiry(token);
  }, [scheduleExpiry]);

  const handleLogout = useCallback(() => {
    clearToken();
    setAuthed(false);
    setCurrentUser(null);
    setStats(null);
    setJobs([]);
  }, []);

  const refresh = useCallback(() => setKey(k => k + 1), []);

  // ── Fetch dashboard data once authenticated ───────────────────────────
  useEffect(() => {
    if (!authed) return;
    Promise.all([
      api("/stats", {}, onUnauthed),
      api("/jobs",  {}, onUnauthed),
    ]).then(([s, j]) => { setStats(s); setJobs(j); }).catch(() => {});
  }, [key, authed, onUnauthed]);

  // ── /auth/me on load — verify token + hydrate user profile ───────────
  // (Runs once; LoginPage also handles this for the initial cold-load path)
  useEffect(() => {
    const token = getToken();
    if (!token || authed) return;
    api("/auth/me", {}, onUnauthed)
      .then(user => {
        setCurrentUser(user);
        setAuthed(true);
        scheduleExpiry(token);
      })
      .catch(() => { clearToken(); });
  }, []); // eslint-disable-line

  // ── Auth Context value ────────────────────────────────────────────────
  const authCtxValue = {
    currentUser,
    isAdmin: currentUser?.role === "admin",
    handleLogout,
    handleLogin,
  };

  // ── Protected route guard ─────────────────────────────────────────────
  if (!authed) return (
    <AuthContext.Provider value={authCtxValue}>
      <LoginPage onLogin={handleLogin} />
    </AuthContext.Provider>
  );

  return (
    <AuthContext.Provider value={authCtxValue}>
      {currentUser?.must_change_password && (
        <ForceChangePasswordModal
          onChanged={() => setCurrentUser(u => ({ ...u, must_change_password: false }))}
          onLogout={handleLogout}
        />
      )}

      {showRegModal && (
        <RegisterModal
          onClose={() => setShowRegModal(false)}
          onSuccess={() => { setShowRegModal(false); }}
        />
      )}

      {showProfileModal && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onSaved={updated => setCurrentUser(updated)}
        />
      )}

      <div style={{ minHeight: "100vh", background: T.bg }}>
        <style>{GLOBAL_CSS}</style>

        {/* ── SIDEBAR ── */}
        <aside style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
          width: sidebarW,
          background: T.surface,
          borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column",
          transition: "width .2s ease",
        }}>
          {/* Collapse toggle — floating on the sidebar edge */}
          <button
            onClick={() => setNavOpen(o => !o)}
            title={navOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              position: "absolute", right: -12, top: 24, zIndex: 110,
              width: 24, height: 24, borderRadius: "50%",
              background: T.surface, border: `1px solid ${T.borderHi}`,
              boxShadow: "0 2px 8px rgba(22,35,58,.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: navOpen ? "none" : "rotate(180deg)", transition: "transform .2s" }}>
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>

          {/* Logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            justifyContent: navOpen ? "flex-start" : "center",
            padding: navOpen ? "0 16px" : 0,
            minHeight: 64, flexShrink: 0,
            borderBottom: `1px solid ${T.border}`,
          }}>
            <Logo size={30} />
            {navOpen && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1, color: T.text1, letterSpacing: "-.2px" }}>
                  Hirelay
                </div>
                <div style={{ color: T.text3, fontSize: "10px", marginTop: "1px" }}>Recruiting Platform</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {NAV_GROUPS.map(group => (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "10px" }}>
                {navOpen ? (
                  <div style={{
                    color: T.text3, fontSize: "10px", fontWeight: 700,
                    letterSpacing: "1px", textTransform: "uppercase",
                    padding: "0 12px", marginBottom: "4px",
                  }}>{group}</div>
                ) : (
                  <div style={{ height: 1, background: T.border, margin: "2px 10px 6px" }} />
                )}
                {TABS.filter(t => t.group === group).map(t => (
                  <NavItem key={t.id} t={t} active={tab === t.id} expanded={navOpen} onClick={() => setTab(t.id)} />
                ))}
              </div>
            ))}
          </nav>

          {/* Status + user block */}
          <div style={{ padding: "10px 8px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            {navOpen && (stats?.ai_enabled || stats?.email_enabled) && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "0 4px", marginBottom: "10px" }}>
                {stats?.ai_enabled    && <Badge label="AI Active"   color={T.green}  bg={T.greenLo}  border={T.greenBd} />}
                {stats?.email_enabled && <Badge label="SMTP Active" color={T.accent} bg={T.accentLo} border={T.accentBd} />}
              </div>
            )}
            {currentUser && <UserMenu
              user={currentUser}
              onAddUser={() => setShowRegModal(true)}
              onEditProfile={() => setShowProfileModal(true)}
              onLogout={handleLogout}
              up fullWidth compact={!navOpen}
            />}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div style={{ marginLeft: sidebarW, transition: "margin-left .2s ease" }}>
        <main style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 60px" }}>
          <StatsBar stats={stats} />

          <Card style={{ overflow: "hidden" }}>
            {/* Tab Header */}
            <div style={{
              padding: "18px 26px 16px",
              borderBottom: `1px solid ${T.border}`,
              background: T.surfaceHi,
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
                  {(() => {
                    const ActiveIcon = TABS.find(t => t.id === tab)?.icon;
                    return ActiveIcon ? <ActiveIcon width={17} height={17} style={{ color: T.accent }} /> : null;
                  })()}
                  <h2 style={{ fontWeight: 700, fontSize: "16px", color: T.text1 }}>
                    {TABS.find(t => t.id === tab)?.label}
                  </h2>
                </div>
                <p style={{ color: T.text3, fontSize: "13px", lineHeight: 1.5 }}>{TAB_DESC[tab]}</p>
              </div>
              <NotificationBell />
            </div>

            {/* Tab Body */}
            <div className="fade-up" key={tab} style={{ padding: "26px" }}>
              {tab === "upload"     && <UploadZone    onSuccess={refresh} />}
              {tab === "match"      && <MatchPanel    jobs={jobs} onRefresh={refresh} emailEnabled={stats?.email_enabled} />}
              {tab === "posting"    && <JobPostingTab jobs={jobs} onRefresh={refresh} />}
              {tab === "interviews" && <InterviewsTab refresh={key} />}
              {tab === "candidates" && <CandidatesTab refresh={key} jobs={jobs} />}
              {tab === "jobs"       && <JobsTab       jobs={jobs} onRefresh={refresh} />}
              {tab === "analytics"  && <Analytics />}
              {tab === "evaluation" && <EvaluationTab />}
            </div>
          </Card>
        </main>
        </div>
      </div>
    </AuthContext.Provider>
  );
}

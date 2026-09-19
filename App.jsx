import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ClipboardCheck,
  FileBarChart,
  History,
  LogOut,
  Camera,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  X,
  Loader2,
  Map as MapIcon,
  Plus,
  Calendar,
  CalendarDays,
  Trash2,
} from "lucide-react";
import { api, session } from "./api";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import FlameLogo from "./FlameLogo";

// Leaflet's default marker icons reference image files in a way that
// breaks under most React bundlers. This rebuilds them from CDN URLs so
// pins actually render instead of showing broken image icons.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Two distinctly colored pins so a start point and an end point are
// visually easy to tell apart on the map \u2014 green for where the
// project begins, orange (matching the brand accent) for where it ends.
const startPointIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
const endPointIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

// Prefers the backend's timeline-based status (calculated from the
// site's actual start/end dates) when it's available; falls back to
// the simpler planned-vs-actual comparison for sites that don't have
// dates set yet. This is what "On Time" / "Delayed" is based on now.
function resolveSiteStatus(site) {
  if (site.timelineStatus) return site.timelineStatus;
  return siteStatus(site.plannedProgress, site.actualProgress);
}

function siteStatus(planned, actual) {
  if (actual >= planned) return "on_track";
  if (planned - actual <= 10) return "watch";
  return "delayed";
}

const STATUS_META = {
  on_track: { label: "On Time", color: "#2D5F3E", bg: "#EAF2EC" },
  watch: { label: "Watch", color: "#8A5A0F", bg: "#FBF1E0" },
  delayed: { label: "Delayed", color: "#A13D2B", bg: "#F8EAE6" },
};

function fmtDate(d) {
  if (!d) return "\u2014";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// SHARED UI PIECES
// ---------------------------------------------------------------------------

function StatusPill({ status }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function TaskStatusPill({ status }) {
  const map = {
    approved: { label: "Approved", color: "#2D5F3E", bg: "#EAF2EC", icon: CheckCircle2 },
    pending: { label: "Pending Review", color: "#8A5A0F", bg: "#FBF1E0", icon: Clock },
    not_started: { label: "Not Started", color: "#4A5A68", bg: "#EEEEEB", icon: Clock },
    rejected: { label: "Sent Back", color: "#A13D2B", bg: "#F8EAE6", icon: AlertTriangle },
  };
  const m = map[status] || map.not_started;
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {m.label}
    </span>
  );
}

function ProgressBar({ planned, actual }) {
  const gap = actual - planned;
  const barColor = gap >= 0 ? "#2D5F3E" : gap >= -10 ? "#C9761A" : "#A13D2B";
  return (
    <div className="w-full">
      <div className="relative h-2 bg-[#E4E1D8] rounded-full overflow-visible">
        <div
          className="absolute top-0 left-0 h-2 rounded-full transition-all"
          style={{ width: `${actual}%`, backgroundColor: barColor }}
        />
        <div className="absolute top-[-3px] w-[2px] h-[14px] bg-[#0F2438]" style={{ left: `${planned}%` }} />
      </div>
      <div className="flex justify-between mt-1 font-mono text-[11px] text-[#4A5A68]">
        <span>Actual {actual}%</span>
        <span>Planned {planned}%</span>
      </div>
    </div>
  );
}

function LoadingBlock({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[#4A5A68] text-sm py-16">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mx-8 mt-6 bg-[#F8EAE6] border border-[#A13D2B]/30 text-[#A13D2B] text-sm rounded-lg px-4 py-3 flex items-center justify-between">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}

function Sidebar({ role, userName, activeView, setActiveView, onLogout }) {
  const menus = {
    admin: [
      { id: "overview", label: "All Sites Overview", icon: LayoutDashboard },
      { id: "users", label: "User Management", icon: Users },
      { id: "projects", label: "Project & Schedule", icon: FolderKanban },
      { id: "approvals", label: "Approval Center", icon: ClipboardCheck },
      { id: "reports", label: "Reports", icon: FileBarChart },
      { id: "audit", label: "Audit Log", icon: History },
    ],
    manager: [
      { id: "overview", label: "My Sites", icon: LayoutDashboard },
      { id: "team", label: "My Team", icon: Users },
      { id: "approvals", label: "Task Approvals", icon: ClipboardCheck },
      { id: "reports", label: "Site Reports", icon: FileBarChart },
    ],
    engineer: [
      { id: "overview", label: "My Tasks", icon: LayoutDashboard },
      { id: "history", label: "Update History", icon: History },
    ],
  };
  const roleLabel = { admin: "Administrator", manager: "Project Manager", engineer: "Site Engineer" };

  return (
    <div className="w-64 shrink-0 h-screen sticky top-0 flex flex-col text-[#F6F4EF]" style={{ backgroundColor: "#0F2438" }}>
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #1a3a5c 0%, #0F2438 100%)", boxShadow: "0 2px 8px rgba(201,118,26,0.15)" }}
          >
            <FlameLogo size={20} color="#E8A85C" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Oil India Limited</div>
            <div className="text-[11px] text-white/50 leading-tight">Progress Tracker</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menus[role].map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-150"
              style={{
                backgroundColor: active ? "rgba(201,118,26,0.16)" : "transparent",
                color: active ? "#E8A85C" : "rgba(246,244,239,0.72)",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "rgba(246,244,239,0.06)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ backgroundColor: "#C9761A" }}
                />
              )}
              <Icon size={17} strokeWidth={2} />
              {item.label}
              {active && <ChevronRight size={14} className="ml-auto opacity-70" />}
            </button>
          );
        })}
      </nav>
      <div className="px-3 pb-5 pt-3 border-t border-white/10">
        <div className="px-3 py-2 mb-1 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ backgroundColor: "rgba(201,118,26,0.2)", color: "#E8A85C" }}
          >
            {userName?.charAt(0)?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{userName}</div>
            <div className="text-[11px] text-white/50">{roleLabel[role]}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </div>
  );
}

function TopStrip({ title, subtitle }) {
  return (
    <div className="px-8 pt-8 pb-6 border-b border-[#E4E1D8]">
      <h1 className="text-2xl font-semibold text-[#0F2438]">{title}</h1>
      {subtitle && <p className="text-sm text-[#4A5A68] mt-1">{subtitle}</p>}
    </div>
  );
}

function KpiCard({ label, value, sub, tone }) {
  const toneColor = tone === "danger" ? "#A13D2B" : tone === "warn" ? "#8A5A0F" : "#0F2438";
  const accentColor = tone === "danger" ? "#A13D2B" : tone === "warn" ? "#C9761A" : "#2D5F3E";
  return (
    <div
      className="relative bg-white border border-[#E4E1D8] rounded-xl px-5 py-4 flex-1 min-w-[160px] overflow-hidden transition-shadow hover:shadow-md"
      style={{ boxShadow: "0 1px 3px rgba(15,36,56,0.04)" }}
    >
      <div className="absolute top-0 left-0 w-full h-[3px]" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
      <div className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1.5" style={{ letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="text-3xl font-mono font-semibold" style={{ color: toneColor }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[#4A5A68] mt-1">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOGIN SCREEN (now hits the real /auth/login endpoint)
// ---------------------------------------------------------------------------

// The right-side illustration on the login screen: a stack of layers
// (monitoring/tech, environment, energy) rising from a flame, with
// small connector nodes pulsing around it \u2014 built entirely in CSS/SVG
// so it loads instantly and animates smoothly, no image file needed.
function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(email.trim(), password);
      session.setToken(data.token);
      session.setStoredUser(data.user);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: "url('/login-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Soft dark wash over the background photo so the centered card
          reads clearly on top, without hiding the artwork/logos */}
      <div className="absolute inset-0" style={{ background: "rgba(15,36,56,0.18)" }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1a3a5c 0%, #0F2438 100%)", boxShadow: "0 4px 16px rgba(201,118,26,0.25)" }}
          >
            <FlameLogo size={26} color="#E8A85C" />
          </div>
          <div className="text-center">
            <h1 className="text-[#0F2438] text-lg font-semibold leading-tight" style={{ textShadow: "0 1px 2px rgba(255,255,255,0.4)" }}>
              Oil India Limited
            </h1>
            <p className="text-[#0F2438]/70 text-xs">Infrastructure Progress Tracking</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-7"
          style={{
            backgroundColor: "rgba(246,244,239,0.94)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 20px 60px rgba(15,36,56,0.35)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <h2 className="text-[#0F2438] font-semibold text-lg mb-1">Welcome back</h2>
          <p className="text-[#4A5A68] text-sm mb-6">Sign in to continue to your dashboard</p>

          <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block" style={{ letterSpacing: "0.06em" }}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@oilindia.in"
            className="w-full border border-[#E4E1D8] rounded-lg px-3.5 py-2.5 text-sm mb-4 bg-white text-[#0F2438] transition-colors focus:outline-none focus:border-[#C9761A]"
          />

          <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block" style={{ letterSpacing: "0.06em" }}>
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
            className="w-full border border-[#E4E1D8] rounded-lg px-3.5 py-2.5 text-sm mb-2 bg-white text-[#0F2438] transition-colors focus:outline-none focus:border-[#C9761A]"
          />

          {error && <p className="text-[#A13D2B] text-xs mb-3 mt-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-medium text-sm text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
            style={{ backgroundColor: "#C9761A", boxShadow: "0 4px 12px rgba(201,118,26,0.3)" }}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>

        <p className="text-center text-[#0F2438]/60 text-xs mt-5" style={{ textShadow: "0 1px 2px rgba(255,255,255,0.4)" }}>
          Connects to the live backend \u2014 make sure the server is running.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADMIN VIEWS
// ---------------------------------------------------------------------------

function GovernmentLogosFooter() {
  return (
    <div className="mt-10 pt-6 border-t border-[#E4E1D8]">
      <p className="text-center text-[10px] uppercase tracking-wide text-[#4A5A68] mb-4" style={{ letterSpacing: "0.08em" }}>
        Developed under
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-90">
        <img src="/govt-logos/ministry-of-education.png" alt="Ministry of Education, Government of India" className="h-10 object-contain" />
        <img src="/govt-logos/sih-2026.png" alt="Smart India Hackathon 2026" className="h-10 object-contain" />
        <img src="/govt-logos/ministry-of-petroleum.png" alt="Ministry of Petroleum and Natural Gas" className="h-10 object-contain" />
        <img src="/govt-logos/indian-oil.png" alt="Indian Oil \u2014 Serves the Nation" className="h-10 object-contain" />
      </div>
    </div>
  );
}

function AdminOverview() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("list"); // "list" | "map"

  const load = useCallback(() => {
    setError("");
    api.getSites().then(setSites).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!sites) return <LoadingBlock label="Loading sites..." />;

  const delayedCount = sites.filter((s) => resolveSiteStatus(s) === "delayed").length;
  const avgProgress = sites.length
    ? Math.round(sites.reduce((a, s) => a + s.actualProgress, 0) / sites.length)
    : 0;

  return (
    <div className="px-8 py-6">
      <div className="flex gap-4 mb-8 flex-wrap">
        <KpiCard label="Total Sites" value={sites.length} />
        <KpiCard label="Avg. Progress" value={`${avgProgress}%`} />
        <KpiCard label="Delayed Sites" value={delayedCount} tone={delayedCount > 0 ? "danger" : undefined} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-sm text-[#0F2438]">Site-wise Progress</div>
        <div className="flex gap-1 bg-white border border-[#E4E1D8] rounded-lg p-1">
          <button
            onClick={() => setView("list")}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ backgroundColor: view === "list" ? "#0F2438" : "transparent", color: view === "list" ? "white" : "#4A5A68" }}
          >
            List
          </button>
          <button
            onClick={() => setView("map")}
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            style={{ backgroundColor: view === "map" ? "#0F2438" : "transparent", color: view === "map" ? "white" : "#4A5A68" }}
          >
            <MapIcon size={13} /> Map
          </button>
        </div>
      </div>

      {view === "map" ? (
        <SitesMapView sites={sites} />
      ) : (
      <div className="bg-white border border-[#E4E1D8] rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(15,36,56,0.04)" }}>
        {sites.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#4A5A68]">No sites yet. Create one from Project & Schedule.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#4A5A68] border-b border-[#E4E1D8]">
                <th className="px-5 py-3 font-medium">Site</th>
                <th className="px-5 py-3 font-medium w-64">Progress</th>
                <th className="px-5 py-3 font-medium">Timeline</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const status = resolveSiteStatus(site);
                return (
                  <tr key={site.id} className="border-b border-[#EFEDE6] last:border-0 transition-colors hover:bg-[#FAF9F6]">
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#0F2438]">{site.name}</div>
                      <div className="text-xs text-[#4A5A68] flex items-center gap-1 mt-0.5">
                        <MapPin size={11} /> {site.location || "\u2014"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <ProgressBar planned={site.plannedProgress} actual={site.actualProgress} />
                    </td>
                    <td className="px-5 py-4 text-xs text-[#4A5A68]">
                      {site.startDate && site.endDate ? (
                        <>
                          <div className="font-mono">{fmtDate(site.startDate)} \u2192 {fmtDate(site.endDate)}</div>
                          {site.expectedProgress !== null && (
                            <div className="mt-0.5">Expected by today: <span className="font-mono">{site.expectedProgress}%</span></div>
                          )}
                        </>
                      ) : (
                        <span className="text-[#9AA5AC]">No timeline set</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      <GovernmentLogosFooter />
    </div>
  );
}

// Map view: shows every site as a pin at its real location. Clicking a
// pin pops up its current progress and whatever task was most recently
// worked on there \u2014 this is the "at a glance, what's happening where"
// view for the admin. Uses OpenStreetMap tiles via Leaflet, which is
// free and needs no API key (unlike Google Maps).
function SitesMapView({ sites }) {
  // A site "has coordinates" if it has at least a start point set.
  const sitesWithCoords = sites.filter((s) => s.start_latitude && s.start_longitude);

  if (sitesWithCoords.length === 0) {
    return (
      <div className="bg-white border border-[#E4E1D8] rounded-lg px-6 py-14 text-center text-sm text-[#4A5A68]">
        No sites have a location set yet. Add start/end coordinates when creating a site to see it on the map.
      </div>
    );
  }

  const avgLat = sitesWithCoords.reduce((a, s) => a + s.start_latitude, 0) / sitesWithCoords.length;
  const avgLng = sitesWithCoords.reduce((a, s) => a + s.start_longitude, 0) / sitesWithCoords.length;

  return (
    <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#E4E1D8] flex items-center gap-4 text-xs text-[#4A5A68]">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#2D5F3E" }} /> Start point</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#C9761A" }} /> End point</span>
      </div>
      <MapContainer center={[avgLat, avgLng]} zoom={8} style={{ height: "420px", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sitesWithCoords.map((site) => {
          const status = resolveSiteStatus(site);
          const hasEndPoint =
            site.end_latitude && site.end_longitude &&
            (site.end_latitude !== site.start_latitude || site.end_longitude !== site.start_longitude);

          const popupContent = (
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{site.name}</div>
              <div style={{ fontSize: 12, color: "#4A5A68", marginBottom: 6 }}>{site.location}</div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                Progress: <strong>{site.actualProgress}%</strong> (planned {site.plannedProgress}%)
              </div>
              <div style={{ fontSize: 11, color: STATUS_META[status].color, fontWeight: 600, marginBottom: 6 }}>
                {STATUS_META[status].label}
              </div>
              {site.currentActivity && (
                <div style={{ fontSize: 12, color: "#0F2438" }}>
                  Currently: {site.currentActivity}
                </div>
              )}
            </div>
          );

          return (
            <React.Fragment key={site.id}>
              <Marker position={[site.start_latitude, site.start_longitude]} icon={startPointIcon}>
                <Popup>{popupContent}</Popup>
              </Marker>
              {hasEndPoint && (
                <>
                  <Marker position={[site.end_latitude, site.end_longitude]} icon={endPointIcon}>
                    <Popup>{popupContent}</Popup>
                  </Marker>
                  <Polyline
                    positions={[
                      [site.start_latitude, site.start_longitude],
                      [site.end_latitude, site.end_longitude],
                    ]}
                    pathOptions={{ color: "#0F2438", weight: 3, dashArray: "6 8", opacity: 0.7 }}
                  />
                </>
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

function AssignSiteModal({ user, sites, onClose, onAssigned }) {
  const [siteId, setSiteId] = useState(sites[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleAssign() {
    if (!siteId) return;
    setSubmitting(true);
    setError("");
    try {
      await api.assignUserToSite(siteId, user.id);
      onAssigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-medium text-[#0F2438]">Assign site</div>
            <div className="text-xs text-[#4A5A68] mt-0.5">{user.name} \u00b7 {user.role}</div>
          </div>
          <button onClick={onClose} className="text-[#4A5A68] hover:text-[#0F2438]">
            <X size={18} />
          </button>
        </div>

        {sites.length === 0 ? (
          <p className="text-sm text-[#4A5A68] mb-4">No sites exist yet. Create a site first.</p>
        ) : (
          <>
            <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block" style={{ letterSpacing: "0.06em" }}>
              Site
            </label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full border border-[#E4E1D8] rounded px-3 py-2.5 text-sm mb-4"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </>
        )}

        {error && <p className="text-[#A13D2B] text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleAssign}
            disabled={submitting || !siteId}
            className="flex-1 py-2.5 rounded text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#C9761A" }}
          >
            {submitting ? "Assigning..." : "Assign"}
          </button>
          <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded text-sm text-[#4A5A68] border border-[#E4E1D8]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingApprovalsPanel({ onActioned }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError("");
    api.getPendingUsers().then(setPending).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function handleApprove(userId) {
    setBusyId(userId);
    try {
      await api.approveUser(userId);
      load();
      onActioned();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(userId) {
    if (!window.confirm("Reject this account request? The person will not be able to log in.")) return;
    setBusyId(userId);
    try {
      await api.rejectUser(userId);
      load();
      onActioned();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!pending) return null;
  if (pending.length === 0) return null;

  return (
    <div className="bg-white border border-[#C9761A]/40 rounded-lg overflow-hidden mb-5">
      <div className="px-5 py-3 bg-[#FBF1E0] border-b border-[#C9761A]/30 flex items-center gap-2">
        <AlertTriangle size={15} className="text-[#8A5A0F]" />
        <span className="text-sm font-medium text-[#0F2438]">
          {pending.length} account{pending.length > 1 ? "s" : ""} awaiting your approval
        </span>
      </div>
      <div className="divide-y divide-[#EFEDE6]">
        {pending.map((u) => (
          <div key={u.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[#0F2438]">
                {u.name} <span className="text-xs text-[#4A5A68] font-normal capitalize">({u.role})</span>
              </div>
              <div className="text-xs text-[#4A5A68]">
                {u.email} \u00b7 added by {u.created_by_name || "unknown"}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleApprove(u.id)}
                disabled={busyId === u.id}
                className="px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "#2D5F3E" }}
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(u.id)}
                disabled={busyId === u.id}
                className="px-3 py-1.5 rounded text-xs font-medium text-[#A13D2B] border border-[#A13D2B]/30 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminUsers({ currentRole }) {
  const [users, setUsers] = useState(null);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "engineer" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [assigningUser, setAssigningUser] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [deletingUserId, setDeletingUserId] = useState(null);

  const isManager = currentRole === "manager";

  const load = useCallback(() => {
    setError("");
    Promise.all([api.getUsers(), api.getSites()])
      .then(([u, s]) => {
        setUsers(u);
        setSites(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");
    setSubmitting(true);
    try {
      const result = await api.createUser(form);
      setForm({ name: "", email: "", password: "", role: "engineer" });
      setShowForm(false);
      setSuccessMsg(result.message || "Account created.");
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(user) {
    const confirmed = window.confirm(
      `Permanently delete ${user.name}'s account? Any tasks assigned to them will become unassigned, but stay on record. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingUserId(user.id);
    try {
      await api.deleteUser(user.id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingUserId(null);
    }
  }

  const roleColor = { admin: "#0F2438", manager: "#C9761A", engineer: "#4A5A68" };
  const statusLabel = (u) => {
    if (!u.is_active) return { text: "Disabled", color: "#A13D2B" };
    if (u.approval_status === "pending") return { text: "Pending approval", color: "#8A5A0F" };
    if (u.approval_status === "rejected") return { text: "Rejected", color: "#A13D2B" };
    return { text: "Active", color: "#2D5F3E" };
  };

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="px-8 py-6">
      {!isManager && <PendingApprovalsPanel onActioned={load} />}

      {successMsg && (
        <div className="bg-[#EAF2EC] border border-[#2D5F3E]/30 text-[#2D5F3E] text-sm rounded-lg px-4 py-3 mb-5">
          {successMsg}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[#4A5A68] max-w-lg">
          {isManager
            ? "Add site engineers to your team. New accounts need admin approval before they can log in \u2014 but you can assign them tasks right away."
            : "Create and manage accounts. Roles decide dashboard access; site assignment decides data visibility."}
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 rounded text-sm font-medium text-white shrink-0"
          style={{ backgroundColor: "#C9761A" }}
        >
          {showForm ? "Cancel" : isManager ? "+ Add Engineer" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-[#E4E1D8] rounded-lg p-5 mb-5 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-[#E4E1D8] rounded px-3 py-2 text-sm col-span-1"
          />
          {isManager ? (
            <input
              disabled
              value="Site Engineer"
              className="border border-[#E4E1D8] rounded px-3 py-2 text-sm col-span-1 bg-[#F6F4EF] text-[#4A5A68]"
            />
          ) : (
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="border border-[#E4E1D8] rounded px-3 py-2 text-sm col-span-1"
            >
              <option value="engineer">Site Engineer</option>
              <option value="manager">Project Manager</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-[#E4E1D8] rounded px-3 py-2 text-sm col-span-1"
          />
          <input
            required
            type="password"
            placeholder="Temporary password (min 8 chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="border border-[#E4E1D8] rounded px-3 py-2 text-sm col-span-1"
          />
          {formError && <p className="text-[#A13D2B] text-xs col-span-2">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="col-span-2 py-2 rounded text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#0F2438" }}
          >
            {submitting ? "Creating..." : isManager ? "Add engineer" : "Create account"}
          </button>
        </form>
      )}

      {!users ? (
        <LoadingBlock label="Loading users..." />
      ) : (
        <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#4A5A68] border-b border-[#E4E1D8]">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {!isManager && <th className="px-5 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const status = statusLabel(u);
                return (
                  <tr key={u.id} className="border-b border-[#EFEDE6] last:border-0">
                    <td className="px-5 py-3.5 font-medium text-[#0F2438]">{u.name}</td>
                    <td className="px-5 py-3.5 text-[#4A5A68]">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ color: "white", backgroundColor: roleColor[u.role] }}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium" style={{ color: status.color }}>{status.text}</td>
                    {!isManager && (
                      <td className="px-5 py-3.5">
                        {u.role !== "admin" && (
                          <div className="flex items-center gap-3">
                            <button onClick={() => setAssigningUser(u)} className="text-xs font-medium text-[#C9761A]">
                              Assign site
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={deletingUserId === u.id}
                              className="text-xs font-medium text-[#A13D2B] disabled:opacity-50 flex items-center gap-1"
                            >
                              <Trash2 size={12} />
                              {deletingUserId === u.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {assigningUser && (
        <AssignSiteModal
          user={assigningUser}
          sites={sites}
          onClose={() => setAssigningUser(null)}
          onAssigned={() => {
            setAssigningUser(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AdminAudit() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.getAuditLog().then(setLogs).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!logs) return <LoadingBlock label="Loading audit log..." />;

  return (
    <div className="px-8 py-6">
      <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
        {logs.length === 0 && <div className="px-5 py-10 text-center text-sm text-[#4A5A68]">No activity recorded yet.</div>}
        {logs.map((entry) => (
          <div key={entry.id} className="px-5 py-4 border-b border-[#EFEDE6] last:border-0 flex items-start gap-4">
            <div className="font-mono text-xs text-[#4A5A68] w-40 shrink-0 pt-0.5">{fmtDate(entry.created_at)}</div>
            <div className="flex-1">
              <div className="text-sm text-[#0F2438]">
                <span className="font-medium">{entry.actor_name || "System"}</span> \u2014 {entry.action.replace(/_/g, " ")}
                {entry.details ? `: ${entry.details}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APPROVAL CENTER (shared by admin + manager)
// ---------------------------------------------------------------------------

function ApprovalCenter() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError("");
    api.getTasks().then((all) => setTasks(all.filter((t) => t.status === "pending"))).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function handleApprove(taskId) {
    setBusyId(taskId);
    try {
      await api.approveTask(taskId);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(taskId) {
    const reason = window.prompt("Reason for sending this back (optional):") || "";
    setBusyId(taskId);
    try {
      await api.rejectTask(taskId, reason);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tasks) return <LoadingBlock label="Loading approvals..." />;

  if (tasks.length === 0) {
    return (
      <div className="px-8 py-6">
        <div className="bg-white border border-[#E4E1D8] rounded-lg px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-[#2D5F3E]" size={32} />
          <div className="font-medium text-[#0F2438]">Nothing waiting on you</div>
          <div className="text-sm text-[#4A5A68] mt-1">All submitted progress updates have been reviewed.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 space-y-4">
      {tasks.map((task) => (
        <div key={task.id} className="bg-white border border-[#E4E1D8] rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] text-[#4A5A68] mb-1">Task #{task.id}</div>
              <div className="font-medium text-[#0F2438]">{task.name}</div>
              <div className="text-xs text-[#4A5A68] mt-1">Last updated {fmtDate(task.last_update)}</div>
            </div>
            <TaskStatusPill status={task.status} />
          </div>

          <div className="mt-4 max-w-sm">
            <ProgressBar planned={task.planned_pct} actual={task.actual_pct} />
          </div>

          {task.remarks && (
            <div className="mt-4 bg-[#F6F4EF] border border-[#E4E1D8] rounded px-3.5 py-2.5 text-sm text-[#0F2438]">
              "{task.remarks}"
            </div>
          )}

          {task.latestPhotoUrl && (
            <a
              href={task.latestPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block"
            >
              <img
                src={task.latestPhotoUrl}
                alt="Site photo submitted by engineer"
                className="w-full max-w-xs rounded-lg border border-[#E4E1D8] object-cover"
                style={{ maxHeight: 220 }}
              />
              <div className="text-[11px] text-[#4A5A68] mt-1 flex items-center gap-1">
                <Camera size={11} /> Tap to view full size
              </div>
            </a>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleApprove(task.id)}
              disabled={busyId === task.id}
              className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "#2D5F3E" }}
            >
              Approve
            </button>
            <button
              onClick={() => handleReject(task.id)}
              disabled={busyId === task.id}
              className="px-4 py-2 rounded text-sm font-medium text-[#A13D2B] border border-[#A13D2B]/30 disabled:opacity-60"
            >
              Send back
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANAGER OVERVIEW
// ---------------------------------------------------------------------------

// Lets a Manager (or Admin) create a custom task for a specific site and
// hand it to one of that site's engineers. The engineer dropdown is
// fetched from /sites/:id/engineers, which the backend restricts to only
// people who actually belong to that site \u2014 so this form can never be
// used to assign work to someone outside the manager's own team.
function CreateTaskModal({ site, onClose, onCreated }) {
  const [engineers, setEngineers] = useState(null);
  const [name, setName] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [plannedPct, setPlannedPct] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSiteEngineers(site.id).then(setEngineers).catch((e) => setError(e.message));
  }, [site.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.createTask({
        siteId: site.id,
        name,
        assignedTo: assignedTo || null,
        plannedStart: plannedStart || null,
        plannedEnd: plannedEnd || null,
        plannedPct,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-medium text-[#0F2438]">New task</div>
            <div className="text-xs text-[#4A5A68] mt-0.5">{site.name}</div>
          </div>
          <button type="button" onClick={onClose} className="text-[#4A5A68] hover:text-[#0F2438]">
            <X size={18} />
          </button>
        </div>

        <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">Task name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Welding Inspection \u2014 Joint 19\u201324"
          className="w-full border border-[#E4E1D8] rounded px-3 py-2.5 text-sm mb-4"
        />

        <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">Assign to engineer</label>
        {!engineers ? (
          <div className="text-xs text-[#4A5A68] mb-4">Loading your team...</div>
        ) : engineers.length === 0 ? (
          <div className="text-xs text-[#A13D2B] mb-4">No engineers are assigned to this site yet.</div>
        ) : (
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full border border-[#E4E1D8] rounded px-3 py-2.5 text-sm mb-4"
          >
            <option value="">Unassigned for now</option>
            {engineers.map((eng) => (
              <option key={eng.id} value={eng.id}>{eng.name}</option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">Planned start</label>
            <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className="w-full border border-[#E4E1D8] rounded px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">Planned end</label>
            <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className="w-full border border-[#E4E1D8] rounded px-3 py-2.5 text-sm" />
          </div>
        </div>

        <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">
          Planned completion target ({plannedPct}%)
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={plannedPct}
          onChange={(e) => setPlannedPct(Number(e.target.value))}
          className="w-full mb-4 accent-[#C9761A]"
        />

        {error && <p className="text-[#A13D2B] text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !name}
            className="flex-1 py-2.5 rounded text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#C9761A" }}
          >
            {submitting ? "Creating..." : "Create task"}
          </button>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded text-sm text-[#4A5A68] border border-[#E4E1D8]">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ManagerOverview() {
  const [sites, setSites] = useState(null);
  const [tasksBySite, setTasksBySite] = useState({});
  const [error, setError] = useState("");
  const [creatingTaskForSite, setCreatingTaskForSite] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const mySites = await api.getSites();
      setSites(mySites);
      const allTasks = await api.getTasks();
      const grouped = {};
      allTasks.forEach((t) => {
        grouped[t.site_id] = grouped[t.site_id] || [];
        grouped[t.site_id].push(t);
      });
      setTasksBySite(grouped);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteTask(task) {
    const confirmed = window.confirm(`Delete task "${task.name}"? This also removes its full submission history. This cannot be undone.`);
    if (!confirmed) return;
    setDeletingTaskId(task.id);
    try {
      await api.deleteTask(task.id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingTaskId(null);
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!sites) return <LoadingBlock label="Loading your sites..." />;

  return (
    <div className="px-8 py-6">
      <div className="flex gap-4 mb-8 flex-wrap">
        <KpiCard label="My Sites" value={sites.length} />
      </div>
      <div className="space-y-4">
        {sites.map((site) => {
          const status = resolveSiteStatus(site);
          const siteTasks = tasksBySite[site.id] || [];
          return (
            <div key={site.id} className="bg-white border border-[#E4E1D8] rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(15,36,56,0.04)" }}>
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#E4E1D8]">
                <div>
                  <div className="font-medium text-[#0F2438]">{site.name}</div>
                  <div className="text-xs text-[#4A5A68] flex items-center gap-1 mt-0.5">
                    <MapPin size={11} /> {site.location || "\u2014"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={status} />
                  <button
                    onClick={() => setCreatingTaskForSite(site)}
                    className="flex items-center gap-1 text-xs font-medium text-[#C9761A] hover:opacity-75 transition-opacity"
                  >
                    <Plus size={13} /> New task
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[#EFEDE6]">
                {siteTasks.length === 0 && <div className="px-5 py-4 text-sm text-[#4A5A68]">No tasks yet.</div>}
                {siteTasks.map((task) => (
                  <div key={task.id} className="px-5 py-3.5 flex items-center gap-4 group">
                    <div className="flex-1 min-w-0 text-sm text-[#0F2438] truncate">{task.name}</div>
                    <div className="w-40 shrink-0">
                      <ProgressBar planned={task.planned_pct} actual={task.actual_pct} />
                    </div>
                    <TaskStatusPill status={task.status} />
                    <button
                      onClick={() => handleDeleteTask(task)}
                      disabled={deletingTaskId === task.id}
                      className="text-[#4A5A68] hover:text-[#A13D2B] transition-colors disabled:opacity-40 shrink-0"
                      title="Delete task"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {creatingTaskForSite && (
        <CreateTaskModal
          site={creatingTaskForSite}
          onClose={() => setCreatingTaskForSite(null)}
          onCreated={() => {
            setCreatingTaskForSite(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ENGINEER VIEWS
// ---------------------------------------------------------------------------

function UpdateTaskModal({ task, onClose, onSubmitted }) {
  const [pct, setPct] = useState(task.actual_pct);
  const [remarks, setRemarks] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      // Try to capture GPS location if the browser allows it \u2014 useful for
      // field verification, but the submission still works if denied.
      let gpsLat, gpsLng;
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        // location unavailable or denied \u2014 proceed without it
      }

      await api.submitTaskUpdate(task.id, { pct, remarks, photoFile, gpsLat, gpsLng });
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-mono text-[11px] text-[#4A5A68] mb-1">Task #{task.id}</div>
            <div className="font-medium text-[#0F2438]">{task.name}</div>
          </div>
          <button onClick={onClose} className="text-[#4A5A68] hover:text-[#0F2438]">
            <X size={18} />
          </button>
        </div>

        <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block" style={{ letterSpacing: "0.06em" }}>
          Actual completion (%)
        </label>
        <input type="range" min="0" max="100" value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full mb-1 accent-[#C9761A]" />
        <div className="font-mono text-2xl font-semibold text-[#0F2438] mb-4">{pct}%</div>

        <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block" style={{ letterSpacing: "0.06em" }}>
          Remarks
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Any delay reason, site condition, or note for the manager..."
          className="w-full border border-[#E4E1D8] rounded px-3 py-2 text-sm mb-4 h-20 resize-none"
        />

        <label className="w-full flex items-center justify-center gap-2 border border-dashed border-[#C9761A] rounded px-3 py-3 text-sm text-[#C9761A] mb-2 cursor-pointer">
          <Camera size={16} />
          {photoFile ? `Photo attached: ${photoFile.name}` : "Attach site photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files[0])}
          />
        </label>

        {error && <p className="text-[#A13D2B] text-xs mb-3 mt-2">{error}</p>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#C9761A" }}
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting ? "Submitting..." : "Submit for approval"}
          </button>
          <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 rounded text-sm text-[#4A5A68] border border-[#E4E1D8]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EngineerOverview() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const [editingTask, setEditingTask] = useState(null);

  const load = useCallback(() => {
    setError("");
    api.getTasks().then(setTasks).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tasks) return <LoadingBlock label="Loading your tasks..." />;

  return (
    <div className="px-8 py-6">
      <div className="flex gap-4 mb-8 flex-wrap">
        <KpiCard label="My Tasks" value={tasks.length} />
        <KpiCard label="Pending Review" value={tasks.filter((t) => t.status === "pending").length} tone="warn" />
      </div>

      <div className="space-y-3">
        {tasks.length === 0 && (
          <div className="bg-white border border-[#E4E1D8] rounded-lg px-6 py-14 text-center text-sm text-[#4A5A68]">
            No tasks assigned to you yet.
          </div>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="bg-white border border-[#E4E1D8] rounded-lg p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="font-mono text-[11px] text-[#4A5A68] mb-1">Task #{task.id}</div>
                <div className="font-medium text-[#0F2438]">{task.name}</div>
                <div className="text-xs text-[#4A5A68] mt-1">
                  {fmtDate(task.planned_start)} \u2192 {fmtDate(task.planned_end)}
                </div>
              </div>
              <TaskStatusPill status={task.status} />
            </div>
            <div className="max-w-sm mb-4">
              <ProgressBar planned={task.planned_pct} actual={task.actual_pct} />
            </div>
            <button
              onClick={() => setEditingTask(task)}
              className="px-4 py-2 rounded text-sm font-medium text-white"
              style={{ backgroundColor: "#0F2438" }}
            >
              Update progress
            </button>
          </div>
        ))}
      </div>

      {editingTask && (
        <UpdateTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmitted={() => {
            setEditingTask(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EngineerHistory() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.getTasks().then((all) => setTasks(all.filter((t) => t.last_update))).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!tasks) return <LoadingBlock label="Loading history..." />;

  return (
    <div className="px-8 py-6">
      <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
        {tasks.length === 0 && <div className="px-5 py-10 text-center text-sm text-[#4A5A68]">No submissions yet.</div>}
        {tasks.map((task) => (
          <div key={task.id} className="px-5 py-4 border-b border-[#EFEDE6] last:border-0">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium text-[#0F2438]">{task.name}</div>
              <TaskStatusPill status={task.status} />
            </div>
            <div className="text-xs text-[#4A5A68]">
              Updated {fmtDate(task.last_update)} \u2014 reported {task.actual_pct}% complete
            </div>
            {task.remarks && <div className="text-sm text-[#4A5A68] mt-2 italic">"{task.remarks}"</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

// Shows every progress submission within a time window (7 or 30 days).
// This is what answers "what happened this week / this month" \u2014 each
// row carries the exact date and time the engineer submitted it, plus
// whether it was approved, so Admin/Manager can see real activity over
// time instead of just a current snapshot.
function ActivityReportView({ range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    setData(null);
    api.getActivityReport(range).then(setData).catch((e) => setError(e.message));
  }, [range]);

  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <LoadingBlock label={`Loading ${range}ly activity...`} />;

  return (
    <div>
      <div className="flex gap-4 mb-5 flex-wrap">
        <KpiCard label="Updates Submitted" value={data.totals.totalUpdates} />
        <KpiCard label="Approved" value={data.totals.approvedUpdates} />
        <KpiCard label="Pending" value={data.totals.pendingUpdates} tone={data.totals.pendingUpdates > 0 ? "warn" : undefined} />
        <KpiCard label="Tasks Completed" value={data.totals.tasksCompleted} />
      </div>

      {data.entries.length === 0 ? (
        <div className="bg-white border border-[#E4E1D8] rounded-lg px-6 py-14 text-center text-sm text-[#4A5A68]">
          No activity in this {range === "week" ? "past 7 days" : "past 30 days"}.
        </div>
      ) : (
        <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#4A5A68] border-b border-[#E4E1D8]">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Site</th>
                <th className="px-5 py-3 font-medium">Task</th>
                <th className="px-5 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">Progress</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[#EFEDE6] last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-[#4A5A68] whitespace-nowrap">{fmtDate(entry.submitted_at)}</td>
                  <td className="px-5 py-3 text-[#0F2438]">{entry.site_name}</td>
                  <td className="px-5 py-3 text-[#0F2438]">{entry.task_name}</td>
                  <td className="px-5 py-3 text-[#4A5A68]">{entry.submitted_by_name}</td>
                  <td className="px-5 py-3 font-mono text-[#4A5A68]">{entry.pct}%</td>
                  <td className="px-5 py-3">
                    <TaskStatusPill status={entry.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportsView() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("summary"); // "summary" | "week" | "month"

  const load = useCallback(() => {
    setError("");
    api.getReportSummary().then(setSummary).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const tabs = [
    { id: "summary", label: "Planned vs Actual", icon: FileBarChart },
    { id: "week", label: "Weekly Report", icon: Calendar },
    { id: "month", label: "Monthly Report", icon: CalendarDays },
  ];

  return (
    <div className="px-8 py-6">
      <div className="flex gap-1 bg-white border border-[#E4E1D8] rounded-lg p-1 mb-5 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3.5 py-2 rounded text-xs font-medium flex items-center gap-1.5"
              style={{ backgroundColor: tab === t.id ? "#0F2438" : "transparent", color: tab === t.id ? "white" : "#4A5A68" }}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "summary" && (
        <>
          {error && <ErrorBanner message={error} onRetry={load} />}
          {!summary && !error && <LoadingBlock label="Loading report..." />}
          {summary && (
            <div className="bg-white border border-[#E4E1D8] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#4A5A68] border-b border-[#E4E1D8]">
                    <th className="px-5 py-3 font-medium">Site</th>
                    <th className="px-5 py-3 font-medium">Planned %</th>
                    <th className="px-5 py-3 font-medium">Actual %</th>
                    <th className="px-5 py-3 font-medium">Variance</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => {
                    const status = row.timelineStatus || siteStatus(row.plannedPct, row.actualPct);
                    return (
                      <tr key={row.siteId} className="border-b border-[#EFEDE6] last:border-0">
                        <td className="px-5 py-3.5 font-medium text-[#0F2438]">{row.siteName}</td>
                        <td className="px-5 py-3.5 font-mono text-[#4A5A68]">{row.plannedPct}%</td>
                        <td className="px-5 py-3.5 font-mono text-[#4A5A68]">{row.actualPct}%</td>
                        <td className="px-5 py-3.5 font-mono" style={{ color: row.variance >= 0 ? "#2D5F3E" : "#A13D2B" }}>
                          {row.variance >= 0 ? "+" : ""}
                          {row.variance}%
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusPill status={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "week" && <ActivityReportView range="week" />}
      {tab === "month" && <ActivityReportView range="month" />}
    </div>
  );
}

// Creates a new site, and optionally assigns a manager to it in the
// same step \u2014 so the admin doesn't need a separate "assign" action
// right after. The manager dropdown is pulled from assignable-users.
function CreateSiteForm({ onCreated }) {
  const [expanded, setExpanded] = useState(false);
  const [managers, setManagers] = useState(null);
  const [form, setForm] = useState({
    name: "", location: "",
    startLatitude: "", startLongitude: "", endLatitude: "", endLongitude: "",
    startDate: "", endDate: "", managerId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (expanded && !managers) {
      api.getAssignableUsers()
        .then((users) => setManagers(users.filter((u) => u.role === "manager")))
        .catch((e) => setError(e.message));
    }
  }, [expanded, managers]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.createSite({
        name: form.name,
        location: form.location || null,
        startLatitude: form.startLatitude || null,
        startLongitude: form.startLongitude || null,
        endLatitude: form.endLatitude || null,
        endLongitude: form.endLongitude || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        managerId: form.managerId || null,
      });
      setForm({
        name: "", location: "",
        startLatitude: "", startLongitude: "", endLatitude: "", endLongitude: "",
        startDate: "", endDate: "", managerId: "",
      });
      setExpanded(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-5">
      <button
        onClick={() => setExpanded((s) => !s)}
        className="px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
        style={{ backgroundColor: "#C9761A", boxShadow: "0 2px 8px rgba(201,118,26,0.25)" }}
      >
        {expanded ? "Cancel" : "+ New Site"}
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#E4E1D8] rounded-xl p-5 mt-3 grid grid-cols-2 gap-3" style={{ boxShadow: "0 4px 16px rgba(15,36,56,0.06)" }}>
          <input
            required
            placeholder="Site name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-[#E4E1D8] rounded-lg px-3 py-2.5 text-sm col-span-2 focus:outline-none focus:border-[#C9761A] transition-colors"
          />
          <input
            placeholder="Location (e.g. Duliajan, Assam)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="border border-[#E4E1D8] rounded-lg px-3 py-2.5 text-sm col-span-2 focus:outline-none focus:border-[#C9761A] transition-colors"
          />

          <div className="col-span-2 grid grid-cols-2 gap-3 bg-[#F6F4EF] border border-[#E4E1D8] rounded-lg p-3">
            <div className="col-span-2 text-xs text-[#4A5A68] flex items-center gap-1.5 mb-0.5">
              <MapPin size={13} />
              Project location \u2014 start and end points, for the map (optional)
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">Start latitude</label>
              <input
                placeholder="e.g. 27.3667"
                value={form.startLatitude}
                onChange={(e) => setForm({ ...form, startLatitude: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">Start longitude</label>
              <input
                placeholder="e.g. 95.3333"
                value={form.startLongitude}
                onChange={(e) => setForm({ ...form, startLongitude: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">End latitude</label>
              <input
                placeholder="e.g. 27.4200"
                value={form.endLatitude}
                onChange={(e) => setForm({ ...form, endLatitude: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">End longitude</label>
              <input
                placeholder="e.g. 95.4100"
                value={form.endLongitude}
                onChange={(e) => setForm({ ...form, endLongitude: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
            <div className="col-span-2 text-[11px] text-[#9AA5AC]">
              Only have one location, not a start/end pair? Enter the same coordinates in both.
            </div>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-3 bg-[#F6F4EF] border border-[#E4E1D8] rounded-lg p-3">
            <div className="col-span-2 text-xs text-[#4A5A68] flex items-center gap-1.5 mb-0.5">
              <Calendar size={13} />
              Project timeline \u2014 used to calculate On Time / Delayed status
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">Start date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-[#4A5A68] mb-1 block">End date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#C9761A] transition-colors"
              />
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-xs uppercase tracking-wide text-[#4A5A68] mb-1.5 block">
              Assign a manager (optional \u2014 can also be done later)
            </label>
            {!managers ? (
              <div className="text-xs text-[#4A5A68]">Loading managers...</div>
            ) : managers.length === 0 ? (
              <div className="text-xs text-[#4A5A68]">No managers exist yet. You can assign one later.</div>
            ) : (
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                className="w-full border border-[#E4E1D8] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9761A] transition-colors"
              >
                <option value="">No manager yet</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-[#A13D2B] text-xs col-span-2">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !form.name}
            className="col-span-2 py-2 rounded text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "#0F2438" }}
          >
            {submitting ? "Creating..." : "Create site"}
          </button>
        </form>
      )}
    </div>
  );
}

function ProjectsView() {
  const [sites, setSites] = useState(null);
  const [tasksBySite, setTasksBySite] = useState({});
  const [error, setError] = useState("");
  const [deletingSiteId, setDeletingSiteId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const allSites = await api.getSites();
      setSites(allSites);
      const allTasks = await api.getTasks();
      const grouped = {};
      allTasks.forEach((t) => {
        grouped[t.site_id] = grouped[t.site_id] || [];
        grouped[t.site_id].push(t);
      });
      setTasksBySite(grouped);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteSite(site) {
    const confirmed = window.confirm(
      `Delete "${site.name}"? This permanently removes the site and all ${(tasksBySite[site.id] || []).length} of its tasks, including their full submission history. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingSiteId(site.id);
    try {
      await api.deleteSite(site.id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingSiteId(null);
    }
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!sites) return <LoadingBlock label="Loading projects..." />;

  return (
    <div className="px-8 py-6 space-y-4">
      <CreateSiteForm onCreated={load} />

      {sites.map((site) => (
        <div key={site.id} className="bg-white border border-[#E4E1D8] rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(15,36,56,0.04)" }}>
          <div className="px-5 py-4 border-b border-[#E4E1D8] flex items-center justify-between">
            <div>
              <div className="font-medium text-[#0F2438]">{site.name}</div>
              {site.startDate && site.endDate && (
                <div className="text-xs text-[#4A5A68] font-mono mt-0.5">
                  {fmtDate(site.startDate)} \u2192 {fmtDate(site.endDate)}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDeleteSite(site)}
              disabled={deletingSiteId === site.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A13D2B] border border-[#A13D2B]/25 hover:bg-[#F8EAE6] transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              {deletingSiteId === site.id ? "Deleting..." : "Delete site"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#4A5A68] border-b border-[#E4E1D8]">
                <th className="px-5 py-2.5 font-medium">Task</th>
                <th className="px-5 py-2.5 font-medium">Planned Start</th>
                <th className="px-5 py-2.5 font-medium">Planned End</th>
                <th className="px-5 py-2.5 font-medium">Progress</th>
                <th className="px-5 py-2.5 font-medium">Photo</th>
              </tr>
            </thead>
            <tbody>
              {(tasksBySite[site.id] || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-[#4A5A68]">No tasks on this site yet.</td>
                </tr>
              )}
              {(tasksBySite[site.id] || []).map((task) => (
                <tr key={task.id} className="border-b border-[#EFEDE6] last:border-0">
                  <td className="px-5 py-3 text-[#0F2438]">{task.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#4A5A68]">{fmtDate(task.planned_start)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#4A5A68]">{fmtDate(task.planned_end)}</td>
                  <td className="px-5 py-3 w-40">
                    <ProgressBar planned={task.planned_pct} actual={task.actual_pct} />
                  </td>
                  <td className="px-5 py-3">
                    {task.latestPhotoUrl ? (
                      <a href={task.latestPhotoUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={task.latestPhotoUrl}
                          alt={`Site photo for ${task.name}`}
                          className="w-12 h-12 rounded-lg object-cover border border-[#E4E1D8] hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ) : (
                      <span className="text-xs text-[#9AA5AC]">\u2014</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => session.getStoredUser());
  const [activeView, setActiveView] = useState("overview");

  function handleLoggedIn(user) {
    setCurrentUser(user);
    setActiveView("overview");
  }

  function handleLogout() {
    session.setToken(null);
    session.setStoredUser(null);
    setCurrentUser(null);
  }

  if (!currentUser) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  const titles = {
    admin: {
      overview: ["All Sites Overview", "Progress across every active project, list-wise"],
      users: ["User Management", "Manage accounts, roles, and site assignments"],
      projects: ["Project & Schedule", "Master schedule for every site"],
      approvals: ["Approval Center", "Review updates escalated for admin sign-off"],
      reports: ["Reports", "Export planned vs actual data"],
      audit: ["Audit Log", "Every action, timestamped"],
    },
    manager: {
      overview: ["My Sites", "Sites assigned to you"],
      team: ["My Team", "Engineers you've added, and their approval status"],
      approvals: ["Task Approvals", "Progress updates awaiting your review"],
      reports: ["Site Reports", "Export data for your assigned sites"],
    },
    engineer: {
      overview: ["My Tasks", "Tasks assigned to you"],
      history: ["Update History", "Your past submissions"],
    },
  };

  const [title, subtitle] = titles[currentUser.role][activeView] || ["", ""];

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F6F4EF", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <Sidebar role={currentUser.role} userName={currentUser.name} activeView={activeView} setActiveView={setActiveView} onLogout={handleLogout} />

      <div className="flex-1">
        <TopStrip title={title} subtitle={subtitle} />

        {currentUser.role === "admin" && activeView === "overview" && <AdminOverview />}
        {currentUser.role === "admin" && activeView === "users" && <AdminUsers currentRole="admin" />}
        {currentUser.role === "admin" && activeView === "projects" && <ProjectsView />}
        {currentUser.role === "admin" && activeView === "approvals" && <ApprovalCenter />}
        {currentUser.role === "admin" && activeView === "reports" && <ReportsView />}
        {currentUser.role === "admin" && activeView === "audit" && <AdminAudit />}

        {currentUser.role === "manager" && activeView === "overview" && <ManagerOverview />}
        {currentUser.role === "manager" && activeView === "team" && <AdminUsers currentRole="manager" />}
        {currentUser.role === "manager" && activeView === "approvals" && <ApprovalCenter />}
        {currentUser.role === "manager" && activeView === "reports" && <ReportsView />}

        {currentUser.role === "engineer" && activeView === "overview" && <EngineerOverview />}
        {currentUser.role === "engineer" && activeView === "history" && <EngineerHistory />}
      </div>
    </div>
  );
}

import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  ChevronRight,
  Download,
  ListX,
  LocateFixed,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { platformName, providers } from "../core/detectors";
import { defaults, record, type Session, type Settings } from "../core/model";
import { CopyButton, Empty, JsonView, SearchBox } from "./components";
import "./style.css";

const sections = [
  "Overview",
  "Tags",
  "Call Tracking",
  "Events",
  "Network",
  "Page Elements",
  "Settings",
];
async function call(type: string, data: Record<string, unknown> = {}) {
  if (!globalThis.chrome?.runtime?.id)
    throw new Error(
      "Load the production build as a Chrome extension to inspect a website.",
    );
  return chrome.runtime.sendMessage({ type, ...data });
}
export function App() {
  const syncVersion = useRef(0);
  const activeTab = useRef<number | undefined>(undefined);
  const [section, setSection] = useState("Overview");
  const [session, setSession] = useState<Session>();
  const [prefs, setPrefs] = useState<Settings>(defaults);
  const [tab, setTab] = useState<number>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    title: string;
    value: unknown;
    copy?: string;
  }>();
  const [filters, setFilters] = useState<
    Record<string, { search: string; source: string; platform: string }>
  >({});
  const [ascending, setAscending] = useState(false);
  const [kind, setKind] = useState("phone");
  const [page, setPage] = useState(1);
  const filter = filters[section] || { search: "", source: "", platform: "" };
  const updateFilter = (field: string, value: string) => {
    setPage(1);
    setFilters({ ...filters, [section]: { ...filter, [field]: value } });
  };
  useEffect(() => {
    let live = true;
    let current: number | undefined;
    let generation = 0;
    async function refresh() {
      const g = ++generation;
      const version = syncVersion.current;
      try {
        if (!globalThis.chrome?.tabs)
          throw new Error(
            "Load dist/ through chrome://extensions, then open a website and click Tag Inspector.",
          );
        const [active] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (active?.id === undefined) return;
        if (current !== active.id) {
          current = active.id;
          activeTab.current = active.id;
          if (live) {
            setSession(undefined);
            setDetail(undefined);
            setTab(active.id);
          }
        }
        const response = await call("GET", { tab: active.id });
        if (!live || g !== generation || version !== syncVersion.current)
          return;
        if (!response.ok) throw new Error(response.error);
        setSession(response.session);
        setPrefs(response.settings);
        setError("");
      } catch (e) {
        if (live && version === syncVersion.current && g === generation) {
          setError(e instanceof Error ? e.message : "Unable to connect");
          setSession(undefined);
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);
  async function action(type: string, data: Record<string, unknown> = {}) {
    const target = tab;
    ++syncVersion.current;
    try {
      const r = await call(type, { tab: target, ...data });
      ++syncVersion.current;
      if (activeTab.current !== target) return;
      if (!r.ok) throw new Error(r.error || "Action failed");
      if (r.session) setSession(r.session);
      if (type === "CLEAR_EVENTS") {
        if (section === "Events") setDetail(undefined);
        setPage(1);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }
  async function preference(next: Settings) {
    setPrefs(next);
    await action("SETTINGS", { settings: next });
  }
  const frames = Object.values(session?.frames || {});
  const evidence = frames.flatMap((f) =>
    f.evidence.map((e) => ({ ...e, origin: f.origin })),
  );
  const elements = frames.flatMap((f) => f.elements);
  const events = session?.events || [];
  const requests = session?.requests || [];
  const detected = providers.filter(
    (p) =>
      evidence.some((e) => e.platform === p.id) ||
      requests.some((r) => r.platform === p.id),
  );
  const search = (v: unknown) =>
    JSON.stringify(v).toLowerCase().includes(filter.search.toLowerCase());
  const open = (title: string, value: unknown, copy?: string) =>
    setDetail({ title, value, copy });
  const exportData = () => {
    if (!session) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            exported: new Date().toISOString(),
            privacy: "Redacted payloads; public page contacts included",
            session,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tag-inspector-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const navigate = (s: string) => {
    setSection(s);
    setDetail(undefined);
    setPage(1);
  };
  const rows = (section === "Network" ? requests : events)
    .filter(
      (e) =>
        search(e) &&
        (!filter.platform || e.platform === filter.platform) &&
        (!filter.source ||
          (section === "Network" ? e.method : e.source) === filter.source),
    )
    .sort((a, b) => (ascending ? a.time - b.time : b.time - a.time));
  return (
    <div className="shell">
      <header>
        <div className="brand">
          <span className="mark">
            <Tag size={18} />
          </span>
          <strong>Tag Inspector</strong>
          <span className="version">01</span>
        </div>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => navigate("Settings")}
        >
          <Settings2 size={17} />
        </button>
      </header>
      <div className="site">
        <div className="eyebrow">INSPECTION WORKSPACE</div>
        <h1>
          {session ? new URL(session.url).hostname : "No website connected"}
        </h1>
        <div className="url" title={session?.url}>
          {session?.url || "Open a website to begin inspecting"}
        </div>
        <div className="capture">
          <span className={`status ${session?.capturing ? "live" : ""}`}>
            <i />
            {session?.capturing ? "Capturing" : "Paused"}
          </span>
          <span className="grow" />
          <button
            type="button"
            disabled={!session}
            onClick={() => action("CAPTURE", { active: !session?.capturing })}
          >
            {session?.capturing ? <Pause size={13} /> : <Play size={13} />}{" "}
            {session?.capturing ? "Pause" : "Start capture"}
          </button>
          <button
            type="button"
            title="Clear events"
            aria-label="Clear events"
            disabled={!session}
            onClick={() => action("CLEAR_EVENTS")}
          >
            <ListX size={14} />
          </button>
        </div>
      </div>
      <nav aria-label="Inspector sections">
        {sections.map((s) => (
          <button
            type="button"
            key={s}
            aria-current={section === s ? "page" : undefined}
            onClick={() => navigate(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      <main>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <Empty title="Connecting to Chrome">Reading the active tab…</Empty>
        ) : detail ? (
          <>
            <button
              type="button"
              className="back"
              onClick={() => setDetail(undefined)}
            >
              <ArrowLeft size={14} />
              Back to {section.toLowerCase()}
            </button>
            <div className="section-heading">
              <h2>{detail.title}</h2>
              <CopyButton
                value={detail.copy || JSON.stringify(detail.value, null, 2)}
              />
            </div>
            <p className="hint">
              Available evidence · sensitive fields are redacted
            </p>
            <div className="element-actions">
              <CopyButton value={detail.title} label="Copy name" />
              {record(detail.value) && typeof detail.value.url === "string" && (
                <CopyButton value={detail.value.url} label="Copy URL" />
              )}
              {record(detail.value) &&
                Array.isArray(detail.value.identifiers) && (
                  <CopyButton
                    value={detail.value.identifiers.join(", ")}
                    label="Copy IDs"
                  />
                )}
            </div>
            <JsonView value={detail.value} />
          </>
        ) : (
          <>
            <div className="section-heading">
              <h2>{section}</h2>
              {section === "Overview" ? (
                <button type="button" disabled={!session} onClick={exportData}>
                  <Download size={14} />
                  Export
                </button>
              ) : ["Events", "Network"].includes(section) ? (
                <button
                  type="button"
                  disabled={!session}
                  onClick={() =>
                    action(section === "Events" ? "CLEAR_EVENTS" : "CLEAR")
                  }
                >
                  <Trash2 size={14} />
                  {section === "Events" ? "Clear timeline" : "Clear streams"}
                </button>
              ) : null}
            </div>
            {section === "Overview" && (
              <>
                <p className="intro">Understand what this page sends.</p>
                <div className="metrics">
                  {[
                    [
                      "Tags",
                      detected.filter((p) => p.category === "tag").length,
                    ],
                    ["Events", events.length],
                    ["Network", requests.length],
                    ["Page Elements", elements.length],
                  ].map(([label, n]) => (
                    <button
                      type="button"
                      key={label}
                      aria-label={`${n} ${label}`}
                      onClick={() => navigate(String(label))}
                    >
                      <strong>{n}</strong>
                      <span>
                        {label}
                        <ChevronRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="subheading">
                  DETECTED TECHNOLOGIES<span>{detected.length}</span>
                </div>
                {detected.length ? (
                  detected.slice(0, 8).map((p) => (
                    <button
                      type="button"
                      className="row"
                      key={p.id}
                      onClick={() => {
                        navigate(
                          p.category === "call" ? "Call Tracking" : "Tags",
                        );
                      }}
                    >
                      <span className="monogram">
                        {p.id.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="grow">
                        <b>{p.name}</b>
                        <small>
                          {requests.some((r) => r.platform === p.id)
                            ? "Network activity observed"
                            : "Configuration evidence"}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <Empty title="No evidence yet">
                    Rescan or reload the page while capture is running. Consent
                    settings and blockers can affect visibility.
                  </Empty>
                )}
                <div className="subheading">LEAD GENERATION</div>
                {["form", "phone", "email"].map((k) => (
                  <button
                    type="button"
                    className="summary-row"
                    key={k}
                    onClick={() => {
                      setKind(k);
                      navigate("Page Elements");
                    }}
                  >
                    <span>
                      {k === "form"
                        ? "Forms"
                        : k === "phone"
                          ? "Phone numbers"
                          : "Email addresses"}
                    </span>
                    <b>{elements.filter((e) => e.kind === k).length}</b>
                    <ChevronRight size={13} />
                  </button>
                ))}
                <div className="note">
                  <ShieldCheck size={16} />
                  <p>
                    Local inspection. Installed tags and observed requests do
                    not prove tracking or conversions are working correctly.
                  </p>
                </div>
              </>
            )}
            {["Tags", "Call Tracking"].includes(section) && (
              <>
                <p className="hint">
                  {section === "Call Tracking"
                    ? "Provider evidence and number replacement observations."
                    : "Select a technology to inspect its evidence and activity."}
                </p>
                <SearchBox
                  value={filter.search}
                  change={(v) => updateFilter("search", v)}
                />
                {detected
                  .filter(
                    (p) =>
                      p.category === (section === "Tags" ? "tag" : "call") &&
                      search([p, evidence.filter((e) => e.platform === p.id)]),
                  )
                  .map((p) => {
                    const ev = evidence.filter((e) => e.platform === p.id);
                    const req = requests.filter((r) => r.platform === p.id);
                    const related = events.filter((e) => e.platform === p.id);
                    const status = req.length
                      ? "Observed activity"
                      : ev.some((e) => e.kind !== "global")
                        ? "Detected configuration"
                        : "Possible detection";
                    return (
                      <button
                        type="button"
                        className="row tag-row"
                        key={p.id}
                        onClick={() =>
                          open(p.name, {
                            status,
                            evidence: ev,
                            identifiers: [...new Set(ev.flatMap((e) => e.ids))],
                            requests: req,
                            events: related,
                            limitation:
                              "No correctness or conversion success is inferred.",
                          })
                        }
                      >
                        <span className="monogram">
                          {p.id.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="grow">
                          <b>{p.name}</b>
                          <small>
                            {status} · {related.length} events
                          </small>
                          <code>
                            {[...new Set(ev.flatMap((e) => e.ids))].join(
                              " · ",
                            ) || "Identifier unavailable"}
                          </code>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    );
                  })}
                {!detected.some(
                  (p) => p.category === (section === "Tags" ? "tag" : "call"),
                ) && (
                  <Empty
                    title={
                      section === "Tags"
                        ? "No tags detected"
                        : "No call tracking detected"
                    }
                  >
                    No supported signatures observed. This does not establish
                    that tracking is absent.
                  </Empty>
                )}
                {section === "Call Tracking" && (
                  <>
                    <div className="subheading">NUMBER REPLACEMENTS</div>
                    <p className="hint">
                      A change does not establish which provider caused it.
                    </p>
                    {events
                      .filter((e) => e.source === "dni")
                      .map((e) => (
                        <button
                          type="button"
                          className="row"
                          key={e.id}
                          onClick={() => open(e.name, e)}
                        >
                          <span className="grow">
                            {e.name}
                            <small>
                              {new Date(e.time).toLocaleTimeString()}
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                  </>
                )}
              </>
            )}
            {["Events", "Network"].includes(section) && (
              <>
                <SearchBox
                  value={filter.search}
                  change={(v) => updateFilter("search", v)}
                />
                <div className="filters">
                  <select
                    aria-label="Platform filter"
                    value={filter.platform}
                    onChange={(e) => updateFilter("platform", e.target.value)}
                  >
                    <option value="">All platforms</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="page">Page</option>
                  </select>
                  <select
                    aria-label="Source filter"
                    value={filter.source}
                    onChange={(e) => updateFilter("source", e.target.value)}
                  >
                    <option value="">
                      {section === "Network" ? "All methods" : "All sources"}
                    </option>
                    {(section === "Network"
                      ? ["GET", "POST", "OPTIONS"]
                      : ["dataLayer", "network", "postMessage", "form", "dni"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Reverse time order"
                    aria-label="Reverse time order"
                    onClick={() => setAscending(!ascending)}
                  >
                    <ArrowDownUp size={14} />
                  </button>
                </div>
                <div className="list-meta">
                  <span>
                    {rows.length} observations ·{" "}
                    {ascending ? "oldest" : "newest"} first
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({
                        ...filters,
                        [section]: { search: "", platform: "", source: "" },
                      });
                      setPage(1);
                    }}
                  >
                    Reset filters
                  </button>
                </div>
                {!session?.capturing && (
                  <p className="notice">
                    Capture is paused. New observations are discarded.
                  </p>
                )}
                {rows.slice(0, page * 60).map((e) => (
                  <button
                    type="button"
                    className="row event-row"
                    key={e.id}
                    onClick={() =>
                      open(
                        e.name,
                        {
                          ...e,
                          explanation:
                            e.source === "network"
                              ? "Request observed by Chrome; response body unavailable."
                              : "Page observation; not a verified conversion.",
                        },
                        undefined,
                      )
                    }
                  >
                    <span className="time">
                      {new Date(e.time).toLocaleTimeString([], {
                        hour12: false,
                      })}
                    </span>
                    <span className="grow">
                      <b>{e.name}</b>
                      <small>
                        {platformName(e.platform)} · {e.source} · frame{" "}
                        {e.frame}
                      </small>
                      {e.url && (
                        <code>
                          {e.method} {e.status || "—"} ·{" "}
                          {new URL(e.url).pathname}
                        </code>
                      )}
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
                {rows.length > page * 60 && (
                  <button
                    type="button"
                    className="more"
                    onClick={() => setPage(page + 1)}
                  >
                    Show 60 more
                  </button>
                )}
                {!rows.length && (
                  <Empty title="No observations to show">
                    Start capture, interact with the website, or adjust your
                    filters. Earlier network traffic cannot be recovered.
                  </Empty>
                )}
              </>
            )}
            {section === "Page Elements" && (
              <>
                <div className="tabs">
                  {["phone", "email", "form"].map((k) => (
                    <button
                      type="button"
                      key={k}
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                    >
                      {k === "phone"
                        ? "Phones"
                        : k === "email"
                          ? "Emails"
                          : "Forms"}{" "}
                      <span>{elements.filter((e) => e.kind === k).length}</span>
                    </button>
                  ))}
                </div>
                <SearchBox
                  value={filter.search}
                  change={(v) => updateFilter("search", v)}
                />
                {elements
                  .filter((e) => e.kind === kind && search(e))
                  .map((e) => (
                    <div
                      className="element"
                      key={`${e.frame}-${e.id}-${e.normalized}`}
                    >
                      <button
                        type="button"
                        className="row"
                        onClick={() =>
                          open(
                            e.label,
                            {
                              ...e,
                              occurrences: elements.filter(
                                (v) =>
                                  v.kind === e.kind &&
                                  v.normalized === e.normalized,
                              ).length,
                            },
                            e.normalized,
                          )
                        }
                      >
                        <span className="grow">
                          <b>{e.label}</b>
                          <small>
                            {e.kind === "form" ? e.normalized : e.location} ·
                            frame {e.frame}
                          </small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                      <div className="element-actions">
                        <CopyButton value={e.normalized} />
                        <button
                          type="button"
                          onClick={() =>
                            action("LOCATE", { id: e.id, frame: e.frame })
                          }
                        >
                          <LocateFixed size={13} />
                          Locate
                        </button>
                      </div>
                    </div>
                  ))}
                {!elements.some((e) => e.kind === kind) && (
                  <Empty
                    title={`No ${kind === "phone" ? "phone numbers" : kind === "email" ? "email addresses" : "forms"} found`}
                  >
                    Rescan after the page finishes loading. Restricted frames
                    and closed shadow roots may be inaccessible.
                  </Empty>
                )}
              </>
            )}
            {section === "Settings" && (
              <>
                <p className="hint">
                  Preferences apply to all inspection sessions.
                </p>
                <label className="setting">
                  Appearance
                  <select
                    value={prefs.theme}
                    onChange={(e) =>
                      preference({
                        ...prefs,
                        theme: e.target.value as Settings["theme"],
                      })
                    }
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="setting">
                  Stream retention
                  <select
                    value={prefs.limit}
                    onChange={(e) =>
                      preference({ ...prefs, limit: Number(e.target.value) })
                    }
                  >
                    {[100, 300, 600].map((n) => (
                      <option key={n} value={n}>
                        {n} per stream
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setting">
                  Start capture when inspecting
                  <input
                    type="checkbox"
                    checked={prefs.automatic}
                    onChange={(e) =>
                      preference({ ...prefs, automatic: e.target.checked })
                    }
                  />
                </label>
                <label className="setting">
                  Observe incoming postMessage
                  <input
                    type="checkbox"
                    checked={prefs.messages}
                    onChange={(e) =>
                      preference({ ...prefs, messages: e.target.checked })
                    }
                  />
                </label>
                <label className="setting stacked">
                  Data layer names
                  <input
                    aria-label="Data layer names"
                    defaultValue={prefs.layers.join(", ")}
                    onBlur={(e) =>
                      preference({
                        ...prefs,
                        layers: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <small>
                    Comma-separated window property names. Up to five.
                  </small>
                </label>
                <div className="note">
                  <ShieldCheck size={16} />
                  <p>
                    Payloads are redacted before storage. Public page contacts
                    are included in exports. Session data is cleared when Chrome
                    closes; up to 12 inspected tabs are retained.
                  </p>
                </div>
                <button
                  type="button"
                  className="danger"
                  onClick={() => action("CLEAR_ALL")}
                >
                  <Trash2 size={14} />
                  Clear all inspection data
                </button>
                <div className="subheading">VISIBILITY LIMITS</div>
                <p className="hint">
                  No response bodies, server-side tracking, closed shadow roots,
                  or traffic from before capture. Custom proxy endpoints may not
                  be recognized. Page scripts can spoof or suppress MAIN-world
                  evidence. Reload existing tabs after installing or updating
                  the extension.
                </p>
              </>
            )}
          </>
        )}
      </main>
      <footer>
        <span>
          <Activity size={12} />
          {frames.length} frames · {events.length} events
        </span>
        <span>
          {session?.dropped ? `${session.dropped} trimmed` : "ON DEVICE"}
        </span>
      </footer>
    </div>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);

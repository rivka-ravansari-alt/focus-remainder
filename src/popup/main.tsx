import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, getUsage, saveSettings } from "../shared/storage";
import { normalizeSiteInput } from "../shared/sites";
import type {
  RuntimeMessage,
  UsageByDate,
  UsageEntry,
  WebsiteSetting
} from "../shared/types";
import "./styles.css";

type SummaryTab = "today" | "yesterday" | "last7";

type SummaryRow = {
  site: string;
  seconds: number;
  sessions: number;
};

const SUMMARY_TABS: { id: SummaryTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" }
];

function getDateKey(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return totalSeconds > 0 ? "<1m" : "0m";
}

function getSessionLabel(sessions: number): string {
  return sessions === 1 ? "1 session" : `${sessions} sessions`;
}

function combineEntries(entries: UsageEntry[]): UsageEntry {
  return entries.reduce(
    (total, entry) => ({
      seconds: total.seconds + entry.seconds,
      sessions: total.sessions + entry.sessions
    }),
    { seconds: 0, sessions: 0 }
  );
}

function buildSummaryRows(
  sites: string[],
  usage: UsageByDate,
  activeTab: SummaryTab
): SummaryRow[] {
  return [...sites].sort().map((site) => {
    const entry =
      activeTab === "last7"
        ? combineEntries(
            Array.from({ length: 7 }, (_value, index) => {
              return usage[getDateKey(index)]?.[site] ?? { seconds: 0, sessions: 0 };
            })
          )
        : usage[getDateKey(activeTab === "today" ? 0 : 1)]?.[site] ?? {
            seconds: 0,
            sessions: 0
          };

    return {
      site,
      seconds: entry.seconds,
      sessions: entry.sessions
    };
  });
}

async function flushUsageTracking(): Promise<void> {
  const message: RuntimeMessage = { type: "FOCUS_FLUSH_USAGE" };
  await chrome.runtime.sendMessage(message);
}

async function notifySettingsChanged(): Promise<void> {
  const message: RuntimeMessage = { type: "FOCUS_SETTINGS_CHANGED" };
  await chrome.runtime.sendMessage(message);
}

function PopupApp() {
  const [websites, setWebsites] = useState<WebsiteSetting[]>([]);
  const [usage, setUsage] = useState<UsageByDate>({});
  const [activeSummaryTab, setActiveSummaryTab] = useState<SummaryTab>("today");
  const [isUsageSummaryOpen, setIsUsageSummaryOpen] = useState(false);
  const [siteInput, setSiteInput] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");

  const sortedWebsites = useMemo(
    () =>
      [...websites].sort((first, second) => {
        if (first.suggested !== second.suggested) {
          return first.suggested ? -1 : 1;
        }

        return first.hostname.localeCompare(second.hostname);
      }),
    [websites]
  );
  const siteHostnames = useMemo(
    () => websites.map((website) => website.hostname),
    [websites]
  );
  const summaryRows = useMemo(
    () => buildSummaryRows(siteHostnames, usage, activeSummaryTab),
    [activeSummaryTab, siteHostnames, usage]
  );

  useEffect(() => {
    async function loadPopupData(): Promise<void> {
      await flushUsageTracking();

      const [settings, storedUsage] = await Promise.all([getSettings(), getUsage()]);

      setWebsites(settings.websites);
      setUsage(storedUsage);
      setStatus("Ready");
    }

    loadPopupData().catch((loadError) => {
      console.error("Focus Reminder popup load failed", loadError);
      setStatus("Could not load data");
      setError("Refresh the popup and try again.");
    });
  }, []);

  // Updates React state optimistically while still surfacing storage failures
  // so the user knows when Chrome did not persist a change.
  async function persistWebsites(nextWebsites: WebsiteSetting[]): Promise<void> {
    setWebsites(nextWebsites);
    setStatus("Saving...");

    try {
      await saveSettings({ websites: nextWebsites });
      await notifySettingsChanged();
      setStatus("Saved");
      setError("");
    } catch (saveError) {
      console.error("Focus Reminder settings save failed", saveError);
      setStatus("Save failed");
      setError("Chrome storage was unavailable. Please try again.");
    }
  }

  async function addSite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedSite = normalizeSiteInput(siteInput);

    if (!normalizedSite) {
      setError("Enter a valid website, like youtube.com.");
      return;
    }

    if (websites.some((website) => website.hostname === normalizedSite)) {
      setError("That website is already on your list.");
      return;
    }

    await persistWebsites([
      ...websites,
      { hostname: normalizedSite, enabled: true, suggested: false }
    ]);
    setSiteInput("");
  }

  async function toggleWebsite(siteToToggle: string): Promise<void> {
    await persistWebsites(
      websites.map((website) =>
        website.hostname === siteToToggle
          ? { ...website, enabled: !website.enabled }
          : website
      )
    );
  }

  async function removeSite(siteToRemove: string): Promise<void> {
    await persistWebsites(
      websites.filter((website) => website.hostname !== siteToRemove)
    );
  }

  async function openTimeMonitoring(): Promise<void> {
    setIsUsageSummaryOpen(true);
    setStatus("Loading usage...");

    try {
      await flushUsageTracking();
      setUsage(await getUsage());
      setStatus("Ready");
      setError("");
    } catch (usageError) {
      console.error("Focus Reminder usage load failed", usageError);
      setStatus("Could not load usage");
      setError("Refresh the popup and try again.");
    }
  }

  return (
    <main className="popup">
      <section className="hero">
        <div>
          <p className="kicker">Focus Reminder</p>
          <h1>Choose calm limits.</h1>
        </div>
        <span className="status">{status}</span>
      </section>

      <form className="add-form" onSubmit={addSite}>
        <label htmlFor="site-input">Add a website</label>
        <div>
          <input
            id="site-input"
            placeholder="example.com"
            type="text"
            value={siteInput}
            onChange={(event) => setSiteInput(event.target.value)}
          />
          <button type="submit">Add</button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <section className="site-list" aria-label="Website monitoring settings">
        {sortedWebsites.length === 0 ? (
          <p className="empty">No websites yet.</p>
        ) : (
          sortedWebsites.map((website) => (
            <article
              className={website.enabled ? "site-card enabled" : "site-card"}
              key={website.hostname}
            >
              <div className="site-info">
                <span>{website.hostname}</span>
                <small>{website.suggested ? "Suggested" : "Custom"}</small>
              </div>
              <div className="site-actions">
                <button
                  className="toggle-button"
                  type="button"
                  aria-pressed={website.enabled}
                  onClick={() => toggleWebsite(website.hostname)}
                >
                  {website.enabled ? "Enabled" : "Disabled"}
                </button>
                {website.suggested ? null : (
                  <button
                    className="remove-button"
                    type="button"
                    onClick={() => removeSite(website.hostname)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <button
        className="monitoring-button"
        type="button"
        aria-expanded={isUsageSummaryOpen}
        onClick={openTimeMonitoring}
      >
        Time monitoring
      </button>

      {isUsageSummaryOpen ? (
        <section className="usage-summary" aria-label="Daily usage summary">
          <div className="summary-header">
            <div>
              <p className="section-kicker">Usage Summary</p>
              <h2>Time on monitored sites</h2>
            </div>
          </div>

          <div className="summary-tabs" role="tablist" aria-label="Usage range">
            {SUMMARY_TABS.map((tab) => (
              <button
                aria-selected={activeSummaryTab === tab.id}
                className={activeSummaryTab === tab.id ? "active" : ""}
                key={tab.id}
                role="tab"
                type="button"
                onClick={() => setActiveSummaryTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="summary-list">
            {summaryRows.length === 0 ? (
              <p className="empty">Add a website to start tracking active time.</p>
            ) : (
              summaryRows.map((row) => (
                <article className="summary-card" key={row.site}>
                  <span className="summary-site">{row.site}</span>
                  <span>{formatDuration(row.seconds)}</span>
                  <span>{getSessionLabel(row.sessions)}</span>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <p className="footer-note">
        Enabled websites ask how long you want to stay. Disabled websites are ignored.
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);

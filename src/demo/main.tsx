import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type WebsiteDemo = {
  hostname: string;
  category: string;
  enabled: boolean;
  time: string;
};

const websites: WebsiteDemo[] = [
  {
    hostname: "youtube.com",
    category: "Video",
    enabled: true,
    time: "22m today"
  },
  {
    hostname: "instagram.com",
    category: "Social",
    enabled: true,
    time: "14m today"
  },
  {
    hostname: "news.example.com",
    category: "Reading",
    enabled: false,
    time: "Paused"
  }
];

const timeRows = [
  { label: "Today", value: "36m", accent: "blue" },
  { label: "Yesterday", value: "48m", accent: "purple" },
  { label: "Last 7 days", value: "3h 12m", accent: "teal" }
];

function DemoApp() {
  return (
    <main className="demo-page" aria-label="Focus Reminder Chrome Web Store demo">
      <section className="hero-copy">
        <p className="eyebrow">Chrome Extension</p>
        <h1>Focus Reminder</h1>
        <p>
          Choose the sites that need softer limits, then keep an eye on your
          browsing time with calm reminders.
        </p>
      </section>

      <section className="product-shell" aria-label="Focus Reminder preview">
        <div className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Website Selection</p>
              <h2>Pick sites to monitor</h2>
            </div>
            <span className="saved-pill">Saved</span>
          </div>

          <div className="add-card">
            <span>example.com</span>
            <button type="button">Add website</button>
          </div>

          <div className="website-list">
            {websites.map((website) => (
              <article className="website-card" key={website.hostname}>
                <div>
                  <strong>{website.hostname}</strong>
                  <span>{website.category} · {website.time}</span>
                </div>
                <button
                  className={website.enabled ? "toggle enabled" : "toggle"}
                  type="button"
                  aria-pressed={website.enabled}
                >
                  <span />
                  {website.enabled ? "Enabled" : "Disabled"}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="panel monitoring-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Time Monitoring</p>
              <h2>See where attention goes</h2>
            </div>
          </div>

          <div className="focus-meter">
            <div>
              <span className="meter-value">36m</span>
              <span className="meter-label">monitored today</span>
            </div>
            <div className="meter-ring" aria-hidden="true" />
          </div>

          <div className="time-grid">
            {timeRows.map((row) => (
              <article className={`time-card ${row.accent}`} key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </article>
            ))}
          </div>

          <div className="reminder-preview">
            <span className="notification-dot" />
            <div>
              <strong>Gentle reminder ready</strong>
              <p>Choose how long to stay before the timer starts.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
);

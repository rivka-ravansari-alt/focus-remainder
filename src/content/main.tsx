import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeMessage, ShowPromptMessage } from "../shared/types";
import styles from "./styles.css?inline";

const PROMPT_OPTIONS = [
  { label: "10 minutes", minutes: 10 },
  { label: "20 minutes", minutes: 20 },
  { label: "30 minutes", minutes: 30 }
];

type ViewState =
  | { name: "hidden" }
  | { name: "prompt"; hostname: string }
  | { name: "expired"; countdown: number };

function sendRuntimeMessage(message: RuntimeMessage): void {
  try {
    chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("Focus Reminder could not send runtime message", error);
  }
}

function FocusReminderContent() {
  const [view, setView] = useState<ViewState>({ name: "hidden" });
  const [customMinutes, setCustomMinutes] = useState("45");
  const [error, setError] = useState("");

  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.type === "FOCUS_SHOW_PROMPT") {
        const promptMessage = message as ShowPromptMessage;
        setError("");
        setView({ name: "prompt", hostname: promptMessage.hostname });
      }

      if (message.type === "FOCUS_TIMER_EXPIRED") {
        setView({ name: "expired", countdown: 3 });
      }

      if (message.type === "FOCUS_HIDE_PROMPT") {
        setError("");
        setView({ name: "hidden" });
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    sendRuntimeMessage({
      type: "FOCUS_PAGE_READY",
      url: window.location.href
    });

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (view.name !== "expired") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (view.countdown === 1) {
        sendRuntimeMessage({ type: "FOCUS_CLOSE_TAB" });
        return;
      }

      setView({ name: "expired", countdown: view.countdown - 1 });
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [view]);

  const customMinutesNumber = useMemo(() => Number(customMinutes), [customMinutes]);

  // Starting a timer hides the prompt immediately; the background worker owns
  // the alarm so refreshes and service worker suspension do not lose state.
  function startTimer(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Enter a positive number of minutes.");
      return;
    }

    sendRuntimeMessage({
      type: "FOCUS_START_TIMER",
      durationMinutes: minutes,
      url: window.location.href
    });

    setView({ name: "hidden" });
  }

  if (view.name === "hidden") {
    return null;
  }

  if (view.name === "expired") {
    return (
      <div className="fr-shell fr-expired" role="dialog" aria-modal="true">
        <div className="fr-expired-card">
          <p className="fr-kicker">Focus Reminder</p>
          <h1>Your timer is done.</h1>
          <div className="fr-countdown" aria-live="assertive">
            {view.countdown}
          </div>
          <p className="fr-muted">This tab will close automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fr-shell" role="dialog" aria-modal="true">
      <div className="fr-modal">
        <button
          className="fr-icon-button"
          type="button"
          aria-label="Dismiss Focus Reminder"
          onClick={() => setView({ name: "hidden" })}
        >
          x
        </button>
        <p className="fr-kicker">Focus Reminder</p>
        <h1>How long would you like here?</h1>
        <p className="fr-muted">
          You are on <strong>{view.hostname}</strong>. Choose a timer for this tab.
        </p>
        <div className="fr-options">
          {PROMPT_OPTIONS.map((option) => (
            <button
              className="fr-primary-button"
              key={option.minutes}
              type="button"
              onClick={() => startTimer(option.minutes)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <form
          className="fr-custom-row"
          onSubmit={(event) => {
            event.preventDefault();
            startTimer(customMinutesNumber);
          }}
        >
          <label htmlFor="fr-custom-minutes">Custom time</label>
          <div>
            <input
              id="fr-custom-minutes"
              min="1"
              step="1"
              type="number"
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
            />
            <button type="submit">Start</button>
          </div>
        </form>
        {error ? <p className="fr-error">{error}</p> : null}
        <button
          className="fr-secondary-button"
          type="button"
          onClick={() => setView({ name: "hidden" })}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

const host = document.createElement("div");
host.id = "focus-reminder-root";
document.documentElement.appendChild(host);

const shadowRoot = host.attachShadow({ mode: "open" });
const styleElement = document.createElement("style");
styleElement.textContent = styles;
shadowRoot.appendChild(styleElement);

const appRoot = document.createElement("div");
shadowRoot.appendChild(appRoot);

createRoot(appRoot).render(
  <React.StrictMode>
    <FocusReminderContent />
  </React.StrictMode>
);

import {
  clearActiveUsageSession,
  getActiveUsageSession,
  getActiveTimers,
  getSettings,
  getUsage,
  removeActiveTimer,
  saveActiveUsageSession,
  saveActiveTimers,
  saveUsage,
  upsertActiveTimer
} from "./shared/storage";
import { getDateKey } from "./shared/date";
import {
  getHostnameFromUrl,
  getLimitedSiteForHostname
} from "./shared/sites";
import type {
  ActiveUsageSession,
  CloseTabMessage,
  PageReadyMessage,
  RuntimeMessage,
  StartTimerMessage
} from "./shared/types";

const ALARM_PREFIX = "focus-reminder-tab-";
let usageTrackingQueue = Promise.resolve();

type TrackingTarget = {
  tabId: number;
  windowId: number;
  site: string;
  hostname: string;
};

function getEnabledSites(settings: Awaited<ReturnType<typeof getSettings>>): string[] {
  return settings.websites
    .filter((website) => website.enabled)
    .map((website) => website.hostname);
}

function getAlarmName(tabId: number): string {
  return `${ALARM_PREFIX}${tabId}`;
}

function getTabIdFromAlarm(alarmName: string): number | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) {
    return null;
  }

  const tabId = Number(alarmName.slice(ALARM_PREFIX.length));
  return Number.isInteger(tabId) ? tabId : null;
}

async function sendMessageToTab(tabId: number, message: RuntimeMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.warn("Focus Reminder could not message tab", tabId, error);
  }
}

function getNextDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function queueUsageTracking(work: () => Promise<void>): Promise<void> {
  const nextWork = usageTrackingQueue.then(work, work);
  usageTrackingQueue = nextWork.catch(() => undefined);
  return nextWork;
}

async function getFocusedWindowId(): Promise<number | null> {
  const focusedWindow = await chrome.windows.getLastFocused();

  if (!focusedWindow.focused || focusedWindow.id === undefined) {
    return null;
  }

  return focusedWindow.id;
}

async function getCurrentTrackingTarget(
  windowId?: number
): Promise<TrackingTarget | null> {
  const focusedWindowId = windowId ?? (await getFocusedWindowId());

  if (focusedWindowId === null) {
    return null;
  }

  const actualFocusedWindowId = await getFocusedWindowId();

  if (actualFocusedWindowId !== focusedWindowId) {
    return null;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    windowId: focusedWindowId
  });
  const tabId = activeTab?.id;
  const url = activeTab?.url;
  const hostname = url ? getHostnameFromUrl(url) : null;

  if (tabId === undefined || !hostname) {
    return null;
  }

  const settings = await getSettings();
  const site = getLimitedSiteForHostname(hostname, getEnabledSites(settings));

  if (!site) {
    return null;
  }

  return {
    tabId,
    windowId: focusedWindowId,
    site,
    hostname
  };
}

function ensureUsageEntry(
  usage: Awaited<ReturnType<typeof getUsage>>,
  dateKey: string,
  site: string
): void {
  usage[dateKey] ??= {};
  usage[dateKey][site] ??= { seconds: 0, sessions: 0 };
}

async function startUsageSession(target: TrackingTarget, now = Date.now()): Promise<void> {
  const usage = await getUsage();
  const todayKey = getDateKey(now);

  ensureUsageEntry(usage, todayKey, target.site);
  usage[todayKey][target.site].sessions += 1;

  await saveUsage(usage);
  await saveActiveUsageSession({
    ...target,
    startedAt: now,
    countedDates: [todayKey]
  });
}

async function flushUsageSession(
  session: ActiveUsageSession,
  clearSession: boolean,
  now = Date.now()
): Promise<void> {
  const usage = await getUsage();
  const countedDates = new Set(session.countedDates);
  let cursor = session.startedAt;

  // Split active time at local midnight so counters naturally reset by date
  // even when a user keeps the same monitored tab focused across midnight.
  while (cursor < now) {
    const dateKey = getDateKey(cursor);
    const segmentEnd = Math.min(now, getNextDayStart(cursor));
    const segmentSeconds = Math.floor((segmentEnd - cursor) / 1000);

    if (segmentSeconds > 0) {
      ensureUsageEntry(usage, dateKey, session.site);

      if (!countedDates.has(dateKey)) {
        usage[dateKey][session.site].sessions += 1;
        countedDates.add(dateKey);
      }

      usage[dateKey][session.site].seconds += segmentSeconds;
    }

    cursor = segmentEnd;
  }

  await saveUsage(usage);

  if (clearSession) {
    await clearActiveUsageSession();
    return;
  }

  await saveActiveUsageSession({
    ...session,
    startedAt: now,
    countedDates: [...countedDates]
  });
}

async function updateUsageTracking(windowId?: number): Promise<void> {
  const session = await getActiveUsageSession();
  const target = await getCurrentTrackingTarget(windowId);

  if (
    session &&
    target &&
    session.tabId === target.tabId &&
    session.windowId === target.windowId &&
    session.site === target.site
  ) {
    return;
  }

  if (session) {
    await flushUsageSession(session, true);
  }

  if (target) {
    await startUsageSession(target);
  }
}

async function flushCurrentUsageWithoutPausing(): Promise<void> {
  const session = await getActiveUsageSession();

  if (!session) {
    return;
  }

  await flushUsageSession(session, false);
}

async function resetUsageTrackingAfterBrowserStartup(): Promise<void> {
  await clearActiveUsageSession();
  const target = await getCurrentTrackingTarget();

  if (target) {
    await startUsageSession(target);
  }
}

async function clearDisabledTimers(enabledSites: string[]): Promise<void> {
  const timers = await getActiveTimers();
  const nextTimers = { ...timers };
  const clearedAlarmNames: string[] = [];

  for (const [tabId, timer] of Object.entries(timers)) {
    if (getLimitedSiteForHostname(timer.hostname, enabledSites)) {
      continue;
    }

    delete nextTimers[tabId];
    clearedAlarmNames.push(getAlarmName(Number(tabId)));
  }

  if (clearedAlarmNames.length === 0) {
    return;
  }

  await Promise.all(clearedAlarmNames.map((alarmName) => chrome.alarms.clear(alarmName)));
  await saveActiveTimers(nextTimers);
}

async function clearTimerForTab(tabId: number): Promise<void> {
  await removeActiveTimer(tabId);
  await chrome.alarms.clear(getAlarmName(tabId));
}

async function hidePromptOnDisabledTabs(enabledSites: string[]): Promise<void> {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      const tabId = tab.id;
      const hostname = tab.url ? getHostnameFromUrl(tab.url) : null;

      if (tabId === undefined || !hostname) {
        return;
      }

      if (getLimitedSiteForHostname(hostname, enabledSites)) {
        return;
      }

      await sendMessageToTab(tabId, { type: "FOCUS_HIDE_PROMPT" });
    })
  );
}

async function handleSettingsChanged(): Promise<void> {
  const settings = await getSettings();
  const enabledSites = getEnabledSites(settings);

  await clearDisabledTimers(enabledSites);
  await hidePromptOnDisabledTabs(enabledSites);
  await queueUsageTracking(() => updateUsageTracking());
}

// Checks each loaded page against the user's saved site list and asks the tab
// to show the timer prompt only when the current host is limited.
async function handlePageReady(
  message: PageReadyMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const tabId = sender.tab?.id;
  const hostname = getHostnameFromUrl(message.url);

  if (tabId === undefined || !hostname) {
    return;
  }

  const settings = await getSettings();
  const enabledSites = getEnabledSites(settings);

  if (!getLimitedSiteForHostname(hostname, enabledSites)) {
    return;
  }

  await queueUsageTracking(() => updateUsageTracking(sender.tab?.windowId));

  const timers = await getActiveTimers();
  const activeTimer = timers[String(tabId)];

  if (activeTimer && activeTimer.deadline > Date.now()) {
    return;
  }

  if (activeTimer && activeTimer.deadline <= Date.now()) {
    await sendMessageToTab(tabId, { type: "FOCUS_TIMER_EXPIRED" });
    return;
  }

  await sendMessageToTab(tabId, {
    type: "FOCUS_SHOW_PROMPT",
    hostname
  });
}

// Stores a per-tab timer and creates an MV3 alarm so the service worker can
// wake reliably even after Chrome suspends it.
async function handleStartTimer(
  message: StartTimerMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const tabId = sender.tab?.id;
  const hostname = getHostnameFromUrl(message.url);

  if (
    tabId === undefined ||
    !hostname ||
    !Number.isFinite(message.durationMinutes) ||
    message.durationMinutes <= 0
  ) {
    return;
  }

  const deadline = Date.now() + message.durationMinutes * 60 * 1000;

  await upsertActiveTimer({
    tabId,
    url: message.url,
    hostname,
    durationMinutes: message.durationMinutes,
    deadline
  });

  await chrome.alarms.create(getAlarmName(tabId), { when: deadline });
}

// Lets the content script finish the visible countdown before the background
// worker performs the privileged tab close operation.
async function handleCloseTab(
  _message: CloseTabMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const tabId = sender.tab?.id;

  if (tabId === undefined) {
    return;
  }

  await clearTimerForTab(tabId);

  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.warn("Focus Reminder could not close tab", tabId, error);
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  const work = async () => {
    switch (message.type) {
      case "FOCUS_PAGE_READY":
        await handlePageReady(message, sender);
        break;
      case "FOCUS_START_TIMER":
        await handleStartTimer(message, sender);
        break;
      case "FOCUS_CLOSE_TAB":
        await handleCloseTab(message, sender);
        break;
      case "FOCUS_FLUSH_USAGE":
        await queueUsageTracking(flushCurrentUsageWithoutPausing);
        break;
      case "FOCUS_SETTINGS_CHANGED":
        await handleSettingsChanged();
        break;
    }
  };

  work()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("Focus Reminder background error", error);
      sendResponse({ ok: false });
    });

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  const tabId = getTabIdFromAlarm(alarm.name);

  if (tabId === null) {
    return;
  }

  const work = async () => {
    const timers = await getActiveTimers();
    const timer = timers[String(tabId)];

    if (!timer) {
      return;
    }

    await sendMessageToTab(tabId, { type: "FOCUS_TIMER_EXPIRED" });
  };

  work().catch((error) => {
    console.error("Focus Reminder alarm error", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const work = async () => {
    await clearTimerForTab(tabId);
    await queueUsageTracking(async () => {
      const session = await getActiveUsageSession();

      if (session?.tabId === tabId) {
        await flushUsageSession(session, true);
      }
    });
  };

  work().catch((error) => {
    console.warn("Focus Reminder cleanup failed", error);
  });
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  queueUsageTracking(() => updateUsageTracking(activeInfo.windowId)).catch((error) => {
    console.warn("Focus Reminder usage tracking failed", error);
  });
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab.active || !changeInfo.url) {
    return;
  }

  queueUsageTracking(() => updateUsageTracking(tab.windowId)).catch((error) => {
    console.warn("Focus Reminder usage tracking failed", error);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  const focusedWindowId =
    windowId === chrome.windows.WINDOW_ID_NONE ? undefined : windowId;

  queueUsageTracking(() => updateUsageTracking(focusedWindowId)).catch((error) => {
    console.warn("Focus Reminder usage tracking failed", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  queueUsageTracking(resetUsageTrackingAfterBrowserStartup).catch((error) => {
    console.warn("Focus Reminder startup tracking failed", error);
  });
});

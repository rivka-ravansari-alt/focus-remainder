import { DEFAULT_LIMITED_SITES, normalizeSiteHostname } from "./sites";
import type {
  ActiveTimer,
  ActiveUsageSession,
  ExtensionSettings,
  UsageByDate,
  WebsiteSetting
} from "./types";

const SETTINGS_KEY = "focusReminder.settings";
const TIMERS_KEY = "focusReminder.activeTimers";
const USAGE_KEY = "usage";
const ACTIVE_USAGE_SESSION_KEY = "focusReminder.activeUsageSession";

const DEFAULT_SETTINGS: ExtensionSettings = {
  websites: DEFAULT_LIMITED_SITES.map((hostname) => ({
    hostname,
    enabled: false,
    suggested: true
  }))
};

type LegacyExtensionSettings = {
  limitedSites?: string[];
  websites?: WebsiteSetting[];
};

function dedupeWebsites(websites: WebsiteSetting[]): WebsiteSetting[] {
  const deduped = new Map<string, WebsiteSetting>();

  for (const website of websites) {
    const hostname = normalizeSiteHostname(website.hostname);

    if (!hostname || deduped.has(hostname)) {
      continue;
    }

    deduped.set(hostname, {
      hostname,
      enabled: Boolean(website.enabled),
      suggested: Boolean(website.suggested)
    });
  }

  return [...deduped.values()];
}

function withSuggestedWebsites(websites: WebsiteSetting[]): WebsiteSetting[] {
  const suggestedHostnames = new Set(DEFAULT_LIMITED_SITES);
  const merged = dedupeWebsites(websites).map((website) => ({
    ...website,
    suggested: website.suggested || suggestedHostnames.has(website.hostname)
  }));
  const existingHostnames = new Set(merged.map((website) => website.hostname));

  for (const hostname of DEFAULT_LIMITED_SITES) {
    if (!existingHostnames.has(hostname)) {
      merged.push({ hostname, enabled: false, suggested: true });
    }
  }

  return merged;
}

function migrateSettings(settings: LegacyExtensionSettings | undefined): ExtensionSettings {
  if (!settings) {
    return DEFAULT_SETTINGS;
  }

  if (Array.isArray(settings.websites)) {
    return {
      websites: withSuggestedWebsites(settings.websites)
    };
  }

  if (Array.isArray(settings.limitedSites)) {
    const suggestedHostnames = new Set(DEFAULT_LIMITED_SITES);
    const migratedWebsites = settings.limitedSites.map((hostname) => {
      const normalizedHostname = normalizeSiteHostname(hostname);
      const suggested = suggestedHostnames.has(normalizedHostname);

      return {
        hostname: normalizedHostname,
        enabled: !suggested,
        suggested
      };
    });

    return {
      websites: withSuggestedWebsites(migratedWebsites)
    };
  }

  return DEFAULT_SETTINGS;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = (await chrome.storage.local.get([SETTINGS_KEY])) as {
    [SETTINGS_KEY]?: LegacyExtensionSettings;
  };
  const storedSettings = result[SETTINGS_KEY];
  const settings = migrateSettings(storedSettings);

  if (!storedSettings || JSON.stringify(storedSettings) !== JSON.stringify(settings)) {
    await saveSettings(settings);
  }

  return settings;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getActiveTimers(): Promise<Record<string, ActiveTimer>> {
  const result = (await chrome.storage.local.get([TIMERS_KEY])) as {
    [TIMERS_KEY]?: Record<string, ActiveTimer>;
  };

  return result[TIMERS_KEY] ?? {};
}

export async function saveActiveTimers(
  timers: Record<string, ActiveTimer>
): Promise<void> {
  await chrome.storage.local.set({ [TIMERS_KEY]: timers });
}

export async function upsertActiveTimer(timer: ActiveTimer): Promise<void> {
  const timers = await getActiveTimers();
  timers[String(timer.tabId)] = timer;
  await saveActiveTimers(timers);
}

export async function removeActiveTimer(tabId: number): Promise<void> {
  const timers = await getActiveTimers();
  delete timers[String(tabId)];
  await saveActiveTimers(timers);
}

export async function getUsage(): Promise<UsageByDate> {
  const result = (await chrome.storage.local.get([USAGE_KEY])) as {
    [USAGE_KEY]?: UsageByDate;
  };

  return result[USAGE_KEY] ?? {};
}

export async function saveUsage(usage: UsageByDate): Promise<void> {
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
}

export async function getActiveUsageSession(): Promise<ActiveUsageSession | null> {
  const result = (await chrome.storage.local.get([ACTIVE_USAGE_SESSION_KEY])) as {
    [ACTIVE_USAGE_SESSION_KEY]?: ActiveUsageSession;
  };

  return result[ACTIVE_USAGE_SESSION_KEY] ?? null;
}

export async function saveActiveUsageSession(
  session: ActiveUsageSession
): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_USAGE_SESSION_KEY]: session });
}

export async function clearActiveUsageSession(): Promise<void> {
  await chrome.storage.local.remove(ACTIVE_USAGE_SESSION_KEY);
}

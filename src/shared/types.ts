export type ExtensionSettings = {
  websites: WebsiteSetting[];
};

export type WebsiteSetting = {
  hostname: string;
  enabled: boolean;
  suggested: boolean;
};

export type ActiveTimer = {
  tabId: number;
  url: string;
  hostname: string;
  durationMinutes: number;
  deadline: number;
};

export type UsageEntry = {
  seconds: number;
  sessions: number;
};

export type UsageByDate = Record<string, Record<string, UsageEntry>>;

export type ActiveUsageSession = {
  tabId: number;
  windowId: number;
  site: string;
  hostname: string;
  startedAt: number;
  countedDates: string[];
};

export type PageReadyMessage = {
  type: "FOCUS_PAGE_READY";
  url: string;
};

export type ShowPromptMessage = {
  type: "FOCUS_SHOW_PROMPT";
  hostname: string;
};

export type StartTimerMessage = {
  type: "FOCUS_START_TIMER";
  durationMinutes: number;
  url: string;
};

export type TimerExpiredMessage = {
  type: "FOCUS_TIMER_EXPIRED";
};

export type HidePromptMessage = {
  type: "FOCUS_HIDE_PROMPT";
};

export type CloseTabMessage = {
  type: "FOCUS_CLOSE_TAB";
};

export type FlushUsageMessage = {
  type: "FOCUS_FLUSH_USAGE";
};

export type SettingsChangedMessage = {
  type: "FOCUS_SETTINGS_CHANGED";
};

export type RuntimeMessage =
  | PageReadyMessage
  | ShowPromptMessage
  | StartTimerMessage
  | TimerExpiredMessage
  | HidePromptMessage
  | CloseTabMessage
  | FlushUsageMessage
  | SettingsChangedMessage;

export const DEFAULT_LIMITED_SITES = [
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "x.com"
];

const LEADING_WWW = /^www\./i;
const LOCALE_SUBDOMAIN = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export function normalizeSiteInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  try {
    const valueWithProtocol = /^[a-z]+:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(valueWithProtocol);
    return normalizeSiteHostname(url.hostname);
  } catch {
    return null;
  }
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(LEADING_WWW, "");
}

export function normalizeSiteHostname(hostname: string): string {
  const normalizedHostname = normalizeHostname(hostname);
  const parts = normalizedHostname.split(".");

  if (parts.length > 2 && LOCALE_SUBDOMAIN.test(parts[0])) {
    return parts.slice(1).join(".");
  }

  return normalizedHostname;
}

export function getHostnameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return normalizeHostname(parsed.hostname);
  } catch {
    return null;
  }
}

export function getLimitedSiteForHostname(
  hostname: string,
  limitedSites: string[]
): string | null {
  const normalizedHostname = normalizeHostname(hostname);

  for (const site of limitedSites) {
    const normalizedSite = normalizeHostname(site);

    if (
      normalizedHostname === normalizedSite ||
      normalizedHostname.endsWith(`.${normalizedSite}`)
    ) {
      return normalizedSite;
    }
  }

  return null;
}

// LL2 slip-history loader.
//
// v106's slip-history.js only catches NET changes the kiosk *personally
// observes* across consecutive polls — anything that slipped before the
// kiosk loaded (or while it was off) is invisible to it. v107 fills
// that gap by pulling LL2's per-launch detail endpoint, which exposes
// an `updates[]` feed of human-readable change-comments. Most NET-push
// entries follow the predictable format
//
//     "Now targeting Apr 30 at 02:42 UTC"
//     "Now targeting Apr 30 at 02:37:53 UTC"
//     "Now targeting NET May 03 at 06:59 UTC"
//
// We parse that, anchor each parsed time to the year of `created_on`
// (LL2 doesn't include the year in the comment), then pair consecutive
// parsed targets and emit slip events with the same shape v106 already
// stores in localStorage. App.jsx folds those events into kiosk-slip-
// history so SlipChip just renders.
//
// Falls back gracefully when LL2 is unreachable or returns garbage —
// returns an empty list, never throws.

import { CONFIG } from './config.js';

const COMMENT_RE = new RegExp(
  String.raw`(?:NET\s+)?(?<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+` +
  String.raw`(?<day>\d{1,2})\s+at\s+(?<h>\d{1,2}):(?<m>\d{2})(?::(?<s>\d{2}))?\s+UTC`,
  'i',
);

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Try to parse a single LL2 update entry into an ISO target NET.
 * Returns the ISO string or null if the comment doesn't carry a
 * parseable time (e.g. "Holding due to weather.", "Added launch.").
 *
 * `createdOn` is used to disambiguate the year — LL2 comments omit it,
 * so we anchor to the year of the comment's own created_on timestamp,
 * then nudge by ±1 year if the resulting NET would be more than 60
 * days away from the comment's creation date (covers the Dec→Jan
 * year-crossing edge case).
 */
export function parseUpdateToIsoNet(comment, createdOn) {
  if (!comment || typeof comment !== 'string') return null;
  const m = COMMENT_RE.exec(comment);
  if (!m) return null;

  const mon = MONTHS[(m.groups.mon || '').toLowerCase()];
  const day = parseInt(m.groups.day, 10);
  const h = parseInt(m.groups.h, 10);
  const min = parseInt(m.groups.m, 10);
  const sec = m.groups.s ? parseInt(m.groups.s, 10) : 0;
  if (mon == null || !Number.isFinite(day) || !Number.isFinite(h)) return null;

  // Anchor year to the comment's created_on. If created_on is missing
  // or unparseable, fall back to the current year — better than
  // bailing out entirely.
  const anchor = createdOn ? new Date(createdOn) : new Date();
  if (!Number.isFinite(anchor.getTime())) return null;
  let year = anchor.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, mon, day, h, min, sec));

  // Year-rollover heuristic: if the candidate is implausibly far from
  // the comment date (>60d either side), shift the year. Real-world
  // NET comments are within a few weeks of their post date, so a 60d
  // window is a safe trigger.
  const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
  const delta = candidate.getTime() - anchor.getTime();
  if (delta > SIXTY_DAYS) {
    // Comment posted in early Jan 2027 referring to "Dec 31" → was
    // actually 2026. Pull the year back.
    candidate = new Date(Date.UTC(year - 1, mon, day, h, min, sec));
  } else if (delta < -SIXTY_DAYS) {
    // Comment posted in late Dec 2026 referring to "Jan 03" → 2027.
    candidate = new Date(Date.UTC(year + 1, mon, day, h, min, sec));
  }

  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
}

/**
 * Build a list of slip events from an LL2 launch's `updates` array.
 *
 * The updates array is newest-first as LL2 returns it. We reverse to
 * oldest-first, parse each comment to a target NET, then walk the list
 * pairing consecutive parsed targets to emit
 *   { fromNet, toNet, deltaSec, observedAt }
 * — exactly the shape SlipChip already renders.
 *
 * Skips updates that don't parse (informational comments, "Added
 * launch." entries, weather-hold notes without a target time, etc.).
 *
 * Returns at most `MAX_SLIPS` (8) most-recent events, matching the
 * cap v106 already enforces in slip-history storage.
 */
export function slipsFromUpdates(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return [];
  // LL2 returns newest-first. Reverse to walk oldest→newest so each
  // pair compares the previous target (older) against the new one.
  const ordered = [...updates].reverse();

  const parsed = [];
  for (const u of ordered) {
    const iso = parseUpdateToIsoNet(u?.comment, u?.created_on);
    if (!iso) continue;
    parsed.push({ targetNet: iso, observedAt: u.created_on });
  }
  if (parsed.length < 2) return [];

  const slips = [];
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (prev.targetNet === cur.targetNet) continue; // same time, skip
    const fromMs = new Date(prev.targetNet).getTime();
    const toMs = new Date(cur.targetNet).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) continue;
    slips.push({
      fromNet: prev.targetNet,
      toNet: cur.targetNet,
      deltaSec: Math.round((toMs - fromMs) / 1000),
      observedAt: cur.observedAt,
    });
  }
  // Keep only the last 8, matching slip-history.js's MAX_SLIPS_PER_LAUNCH.
  return slips.slice(-8);
}

/**
 * Fetch /launch/<id>/ from LL2 and extract its slip history. Wraps
 * everything in a try/catch + 8s abort so a flaky LL2 never breaks
 * the rest of the kiosk render.
 */
export async function fetchSlipsForLaunch(launchId) {
  if (!launchId) return [];
  // Reuse the same base path as ll2.js so deployments behind the
  // /api/ll2/ reverse-proxy keep working.
  const base = (CONFIG?.LL2_BASE) || 'https://ll.thespacedevs.com/2.2.0';
  const url = `${base.replace(/\/$/, '')}/launch/${encodeURIComponent(launchId)}/`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return slipsFromUpdates(data?.updates);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

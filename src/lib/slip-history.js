// Launch slip ("NET push") history.
//
// LL2 publishes a `net` field (the No Earlier Than timestamp). When the
// schedule slips — weather, vehicle issue, range conflict, etc. — that
// value changes. We poll every ~5 minutes; on each poll we compare the
// new `net` against the last value we saw for the same launch ID and
// emit a slip event when they differ.
//
// Persistence: localStorage under `kiosk-slip-history`, keyed by
// launch.id. Each entry tracks the last-known net + an array of slip
// events with { fromNet, toNet, deltaSec, observedAt }. We prune
// aggressively: only keep slip data for launches whose new T-0 hasn't
// elapsed by more than 24 hours, so the kiosk doesn't accumulate
// indefinitely.

const STORAGE_KEY = 'kiosk-slip-history';
const MAX_SLIPS_PER_LAUNCH = 8;        // keep last 8 slips per launch
const PURGE_AFTER_LIFTOFF_MS = 24 * 60 * 60 * 1000;  // T+24h
// "Recent" window for the NET-UPDATED chip — slips within this window
// get the visual flag in the UI. 6 hours feels right: long enough to
// catch overnight slips that viewers didn't see live, short enough that
// the chip doesn't go stale.
export const RECENT_SLIP_WINDOW_MS = 6 * 60 * 60 * 1000;

function safeParseStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    // Corrupt JSON or storage error — start fresh rather than crash.
    return {};
  }
}

function safeWriteStorage(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota exceeded or storage unavailable — slip history is nice-to-
    // have, not essential. Drop on the floor rather than throw.
  }
}

/**
 * Run a slip-detection pass against a fresh launch object from LL2.
 * Returns the (possibly updated) slip-history entry for this launch.
 *
 * Side effect: writes to localStorage when the entry changes.
 *
 * Shape of the returned object:
 *   {
 *     lastKnownNet: ISO string,
 *     slips: [
 *       { fromNet, toNet, deltaSec, observedAt },
 *       ...newest-last
 *     ]
 *   }
 *
 * If the input is invalid (no id, no net) returns null.
 */
export function recordLaunchPoll(launch) {
  if (!launch?.id || !launch?.net) return null;
  const all = safeParseStorage();

  // Purge entries for launches that have gone past liftoff + 24h.
  // We do this on every write so storage stays small without needing
  // a separate pruning pass.
  const now = Date.now();
  for (const [id, entry] of Object.entries(all)) {
    if (!entry?.lastKnownNet) continue;
    const tDelta = now - new Date(entry.lastKnownNet).getTime();
    if (tDelta > PURGE_AFTER_LIFTOFF_MS) delete all[id];
  }

  const prev = all[launch.id] || { lastKnownNet: null, slips: [] };
  const prevNet = prev.lastKnownNet;
  const newNet = launch.net;

  if (!prevNet) {
    // First time we've seen this launch. Just record the baseline,
    // no slip event.
    all[launch.id] = { lastKnownNet: newNet, slips: prev.slips || [] };
    safeWriteStorage(all);
    return all[launch.id];
  }

  if (prevNet === newNet) {
    // No change. Don't even rewrite storage — saves a stringify on
    // every poll when nothing's happening (the common case).
    return prev;
  }

  // Slip detected. Record it.
  const fromMs = new Date(prevNet).getTime();
  const toMs   = new Date(newNet).getTime();
  const deltaSec = Math.round((toMs - fromMs) / 1000);

  // Defensive: if the timestamps don't parse to numbers (corrupt
  // input), skip the slip event but still update lastKnownNet so we
  // don't keep retrying the same comparison.
  if (!Number.isFinite(deltaSec)) {
    all[launch.id] = { ...prev, lastKnownNet: newNet };
    safeWriteStorage(all);
    return all[launch.id];
  }

  const slip = {
    fromNet: prevNet,
    toNet: newNet,
    deltaSec,
    observedAt: new Date().toISOString(),
  };

  const nextSlips = [...(prev.slips || []), slip].slice(-MAX_SLIPS_PER_LAUNCH);
  const updated = { lastKnownNet: newNet, slips: nextSlips };
  all[launch.id] = updated;
  safeWriteStorage(all);
  return updated;
}

/**
 * Get the slip-history entry for a specific launch ID, or null if we
 * haven't tracked any polls for it yet.
 */
export function getSlipHistory(launchId) {
  if (!launchId) return null;
  const all = safeParseStorage();
  return all[launchId] || null;
}

/**
 * Format a delta in seconds as a human-readable signed duration.
 *   +8h 0m, −2h 30m, +45m, −15s
 * Used in the "NET UPDATED" chip and the slip strip.
 */
export function formatDelta(deltaSec) {
  if (!Number.isFinite(deltaSec) || deltaSec === 0) return '+0';
  const sign = deltaSec >= 0 ? '+' : '−';
  const abs = Math.abs(deltaSec);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  if (minutes > 0) return `${sign}${minutes}m`;
  return `${sign}${seconds}s`;
}

/**
 * Format an ISO NET timestamp as a short Pacific-time string —
 * "WED 07:00 PM PDT". Used in the slip-history strip so viewers can
 * read at a glance "23:00 went to 07:00".
 */
export function formatShortNet(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    // toLocaleString returns "Wed, 07:00 PM" — uppercase + drop the
    // weekday's trailing comma so the chip reads as a single tight unit.
    return date.replace(',', '').toUpperCase();
  } catch {
    return iso;
  }
}

/**
 * Has the most recent slip happened within RECENT_SLIP_WINDOW_MS?
 * Used to decide whether to show the "NET UPDATED" chip.
 */
export function hasRecentSlip(slipEntry) {
  if (!slipEntry?.slips?.length) return false;
  const last = slipEntry.slips[slipEntry.slips.length - 1];
  if (!last?.observedAt) return false;
  const age = Date.now() - new Date(last.observedAt).getTime();
  return age >= 0 && age < RECENT_SLIP_WINDOW_MS;
}

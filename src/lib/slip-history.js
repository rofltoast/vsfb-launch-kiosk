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
const SCHEMA_VERSION_KEY = 'kiosk-slip-history-schema';
// Bump this whenever the storage shape or data semantics change in a
// way that should invalidate older client data. v111 bumped from
// implicit-v1 to v2 to clear out stale wrong pairs that v106's live
// observer wrote across multiple page loads (it could pair the
// kiosk's current NET against a remembered-but-skipped earlier one,
// producing real-but-non-adjacent slips like 07:00 ⇒ 07:42:49). The
// LL2-feed-authoritative seeder in v110 won't overwrite these fast
// enough to feel right — bumping the schema clears them on load.
const SCHEMA_VERSION = 2;
const MAX_SLIPS_PER_LAUNCH = 8;        // keep last 8 slips per launch
const PURGE_AFTER_LIFTOFF_MS = 24 * 60 * 60 * 1000;  // T+24h
// "Recent" window for the NET-UPDATED chip — slips within this window
// get the visual flag in the UI. 6 hours feels right: long enough to
// catch overnight slips that viewers didn't see live, short enough that
// the chip doesn't go stale.
export const RECENT_SLIP_WINDOW_MS = 6 * 60 * 60 * 1000;

function safeParseStorage() {
  try {
    // v111: schema check. If the stored schema is older than current
    // (or absent), wipe slip history and stamp the new version. This
    // handles cleanly the case where v106-era live-observed wrong
    // pairs are still hanging around in viewers' localStorage.
    const storedVersion = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || '0', 10);
    if (!Number.isFinite(storedVersion) || storedVersion < SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION));
      return {};
    }
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
 * Seed slip history from an external source (the LL2 updates feed,
 * v107). The feed is canonical for any NET change LL2 has recorded —
 * v110 makes this the AUTHORITATIVE source: when feedSlips is non-
 * empty, we replace the stored slips for this launch with the feed
 * data, then re-append any live-observed slips that post-date the
 * newest feed entry (i.e. happened after our last LL2 detail fetch).
 *
 * Why: v106's live observer creates slip pairs by comparing the
 * current NET against whatever the kiosk last saw, which can skip
 * intermediate values across page loads. That produces invalid pairs
 * like "07:00 PM ⇒ 07:42 PM (+42m)" when the real timeline went
 * 07:00 → 07:37 → 07:37:53 → 07:42:49. The feed has the correct
 * sequence; trust it.
 *
 * `currentLaunchNet` is used to set lastKnownNet so v106's future
 * polls compare against the right baseline.
 *
 * Returns null and no-ops when feedSlips is empty (LL2 feed didn't
 * parse anything) so we don't clobber existing data with nothing.
 */
export function seedSlipsFromFeed(launchId, feedSlips, currentLaunchNet) {
  if (!launchId) return null;
  if (!Array.isArray(feedSlips) || feedSlips.length === 0) return null;

  const all = safeParseStorage();
  const prev = all[launchId] || { lastKnownNet: null, slips: [] };

  // Find the timestamp of the newest feed entry. Any live-observed
  // slip that arrived AFTER this is something the feed hasn't caught
  // up to yet — preserve it. Slips before this are superseded by the
  // feed's authoritative ordering.
  const newestFeedAt = feedSlips.reduce((acc, s) => {
    const t = s.observedAt ? new Date(s.observedAt).getTime() : 0;
    return t > acc ? t : acc;
  }, 0);

  // Live-observed extras: kept only if they happened post-feed AND
  // their (fromNet,toNet) pair isn't already in the feed.
  const feedKeys = new Set(feedSlips.map((s) => `${s.fromNet}|${s.toNet}`));
  const liveExtras = (prev.slips || []).filter((s) => {
    if (feedKeys.has(`${s.fromNet}|${s.toNet}`)) return false;
    const t = s.observedAt ? new Date(s.observedAt).getTime() : 0;
    return t > newestFeedAt;
  });

  const merged = [...feedSlips, ...liveExtras];
  // Sort chronologically by observedAt so the strip walks
  // oldest→newest internally; SlipChip reverses for display.
  merged.sort((a, b) => {
    const ta = a.observedAt ? new Date(a.observedAt).getTime() : 0;
    const tb = b.observedAt ? new Date(b.observedAt).getTime() : 0;
    return ta - tb;
  });
  const trimmed = merged.slice(-MAX_SLIPS_PER_LAUNCH);

  const lastKnownNet =
    currentLaunchNet ||
    (trimmed.length > 0 ? trimmed[trimmed.length - 1].toNet : prev.lastKnownNet);

  all[launchId] = { lastKnownNet, slips: trimmed };
  safeWriteStorage(all);
  return all[launchId];
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
 * "WED 07:00 PM" by default, or "WED 07:00:53 PM" when `withSeconds`
 * is true. Used in the slip-history strip so viewers can read at a
 * glance "23:00 went to 07:00".
 *
 * v110: callers can opt into sub-minute precision when displaying a
 * slip whose magnitude is < 60s, OR whose endpoints don't share the
 * same minute boundary. Without this, +53s slips render as
 * "07:37 PM ⇒ 07:37 PM" (visually identical), making the math look
 * wrong.
 */
export function formatShortNet(iso, withSeconds = false) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const opts = {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    };
    if (withSeconds) opts.second = '2-digit';
    const date = d.toLocaleString('en-US', opts);
    // toLocaleString returns "Wed, 07:00 PM" — uppercase + drop the
    // weekday's trailing comma so the chip reads as a single tight unit.
    return date.replace(',', '').toUpperCase();
  } catch {
    return iso;
  }
}

/**
 * v110: should this slip be rendered with sub-minute precision in
 * the strip? Returns true when EITHER endpoint has non-zero seconds
 * (i.e. minute-rounding would visually flatten the difference). The
 * caller flips both endpoints together so the row stays consistent.
 */
export function slipNeedsSeconds(slip) {
  if (!slip) return false;
  for (const iso of [slip.fromNet, slip.toNet]) {
    if (!iso) continue;
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) continue;
    if (d.getUTCSeconds() !== 0) return true;
  }
  // Edge case: same-minute slip (delta < 60s) but endpoints both have
  // zero seconds — shouldn't happen in real LL2 data but cheap to
  // guard against.
  if (Math.abs(slip.deltaSec) < 60) return true;
  return false;
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

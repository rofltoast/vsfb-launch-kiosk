import { useEffect, useState } from 'react';
import {
  getSlipHistory,
  formatDelta,
  formatShortNet,
  slipNeedsSeconds,
} from '../lib/slip-history.js';

/**
 * SlipChip — recent-slip history strip.
 *
 * Shown next to the LIFTOFF row in both ambient layouts when there's
 * been a NET change for this launch. Quiet and invisible when nothing
 * has slipped.
 *
 * Each slip row is laid out as
 *
 *     WED 07:00 PM  ⇒  THU 02:42 AM
 *                   (+8h 0m)
 *
 * The "from → to" is the top line, the delta sits underneath. This
 * stacks cleanly on narrow phone viewports without truncating the
 * delta (the v107 single-line layout was getting ellipsized at <500px
 * and dropping the magnitude off the right side, making the
 * calculations look wrong). On desktop the two lines are still
 * visually grouped but readable at a glance.
 *
 * Reads from localStorage on mount + on every poll. Re-polls every
 * 30 seconds so a slip detected by App.jsx during a routine LL2 fetch
 * shows up here without prop-drilling.
 *
 * v108: dropped the standalone "NET UPDATED" pill — the strip already
 * carries the magnitude in its first row, the pill was redundant.
 */
export function SlipChip({ launchId, compact = false }) {
  const [entry, setEntry] = useState(() => getSlipHistory(launchId));

  // Re-read storage on a 30s tick so freshly-detected slips appear in
  // the UI without threading a re-render signal down from App.jsx.
  useEffect(() => {
    setEntry(getSlipHistory(launchId));
    const id = setInterval(() => {
      setEntry(getSlipHistory(launchId));
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [launchId]);

  if (!entry || !entry.slips || entry.slips.length === 0) return null;

  // v111: sort by the slip's target NET (toNet) descending so the
  // most-recent-time-the-launch-was-targeting sits at the top. v109
  // was sorting by `observedAt`, which made stale live-observed pairs
  // (e.g. v106's "07:00 ⇒ 07:42:49 +42m" with a fresh observedAt)
  // float above the actually-newer feed-derived slips. Sorting by
  // toNet means whichever pair points at the latest target NET wins
  // the top slot, regardless of when it was recorded.
  const recentSlips = [...entry.slips]
    .sort((a, b) => {
      const ta = new Date(a.toNet || 0).getTime();
      const tb = new Date(b.toNet || 0).getTime();
      return tb - ta;
    })
    .slice(0, 3);

  // v111: if ANY row in the strip needs seconds (because either of
  // its endpoints has sub-minute precision), render them on EVERY
  // row so the timestamp column visually lines up. Otherwise the
  // strip looks ragged with some rows showing seconds and others not.
  const anyNeedsSeconds = recentSlips.some((s) => slipNeedsSeconds(s));

  return (
    <div className={`slip-strip-wrap ${compact ? 'slip-compact' : ''}`}>
      <ul className="slip-strip" aria-label="recent NET changes">
        {recentSlips.map((s, i) => (
          <li key={s.observedAt + '-' + i} className="slip-row">
            <span className="slip-from dim">{formatShortNet(s.fromNet, anyNeedsSeconds)}</span>
            <span className="slip-arrow" aria-hidden="true">⇒</span>
            <span className="slip-to">{formatShortNet(s.toNet, anyNeedsSeconds)}</span>
            <span
              className={`slip-delta ${s.deltaSec >= 0 ? 'slip-pos' : 'slip-neg'}`}
              aria-label={`delta ${formatDelta(s.deltaSec)}`}
            >
              {formatDelta(s.deltaSec)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

# Changelog

All notable changes to the VSFB Launch Kiosk. Version numbers correspond
to the internal `v##` ship tags used in code comments throughout the
repo.

## v105 — 2026-04
- Restructured the README to lead with ambient + live (the actual app)
  instead of the optional 24/7 broadcast. Added screenshots of all four
  view variants (ambient × {polished, terminal}, live × {polished,
  terminal}). New banner image at the top.

## v104 — 2026-04
- Initial public GitHub release. Repo cleaned, documented, MIT-licensed,
  pushed to `rofltoast/vsfb-launch-kiosk`. Deploy artifacts gathered
  under `deploy/stream/` with their own README.

## v103 — 2026-04
- Nudged the Falcon 9 silhouette in the ambient VEHICLE box a few
  pixels right (closer to the box edge) in both terminal and polished
  layouts.

## v102 — 2026-04
- Added a mobile-only floating theme cycler button. Phones don't
  have a `T` key; this button cycles through the active palette set
  on each tap. Hidden on desktop via `(max-width: 768px) and (pointer:
  coarse)` so the Pi kiosk displays don't show it either.

## v101 — 2026-04 *(reverted in same release)*
- Added then immediately removed a "mobile layout" / "viewport mode"
  switcher — the layouts work fine on phones at their native scale,
  what was missing was the theme switcher. Replaced with v102.

## v100 — 2026-04
- Enlarged the retro weather-map slide on `/retro`. Tightened the
  title card and let the SVG bleed into the bottom crawl reservation.
- Added `/api/ll2/` and `/api/nws/` reverse-proxy blocks to the
  Hetzner kiosk nginx — fixed missing temps and missing launch
  schedule on the live broadcast (root cause: the migration from pi
  → Hetzner left the proxy config behind).
- Distinguished "LL2 returned empty" from "LL2 fetch failed" in the
  launches slide. Empty shows `NO LAUNCHES ON THE BOARD`; failure
  shows `SCHEDULE UNAVAILABLE — LL2 UPSTREAM UNREACHABLE`.

## v99 — 2026-04
- Migrated the YouTube Live stream from the on-site Pi to a Hetzner
  CX22 (and later CPX21). The Pi now only runs the on-site kiosk for
  humans physically present.
- Killed duplicate ingester (pi + Hetzner were both pushing to the
  same stream key, causing intermittent corruption).

## v97 — 2026-04
- Bulletproof cursor-kill on the streaming pipeline. Three-layer:
  XBM root cursor + unclutter-xfixes + `ffmpeg -draw_mouse 0`. See
  `deploy/stream/README.md` for the full ritual.

## v96 — 2026-04
- Pulled the weather-slide title card up toward the header bar; let
  the map fill the remaining slide space. Map got noticeably bigger.

## v95 — 2026-04
- Killed the visible cursor (round 1, before v97 made it stick).
- Resized facts dots + body so the rotating fact card stops
  overflowing on long facts.

## v94 — 2026-04
- Fixed stream lag (encoder settings) and the smooshed launches
  slide.

## v92 — 2026-04
- Slow ticker (was scrolling too fast to read on a phone).
- Codec-card timing tightened so the MGS portrait sequence reads
  consistently.

## v90 — 2026-04
- Mouse cursor hide round 1.
- Codec-portrait clip now properly aligned.
- Compass directions on weather card.

## v89 — 2026-04
- Fixed clock timezone — render Pacific not UTC.

## v87 — 2026-03
- Deep layout audit at 1280×720. Found and fixed a dozen alignment
  issues. (Ongoing — the kiosk has many breakpoints.)

## v85 — 2026-03
- Fixed the silent Hetzner audio pipeline (PulseAudio null-sink
  routing).

## v84 — 2026-03
- 24/7 YouTube Live stream goes live. The retro broadcast has a
  permanent home.

## v79 — 2026-03
- Live weather + scrolling launches in the bottom ticker.

## v76 — 2026-03
- MGS-style codec portraits on the retro broadcast. Yes, exactly like
  Metal Gear Solid 1 PSX UI. Yes, on purpose.

## v74 — 2026-03
- "COMMERCIAL IN PROGRESS" badge during inter-cycle skits so viewers
  know we're not glitching.

## v72 — 2026-02
- Consolidated to 6 skit episodes with 6 alternate takes each.

## v68 — 2026-02
- Centered fact dots + sign-off layout.
- Restored the hidden RECORD button in `/admin/retro`.

## Earlier
- `/retro` retro-broadcast SPA built and shipped.
- Live mode: real-time trajectory graph, telemetry rail, scrolling
  event log, embedded webcast.
- Ambient mode: countdown hero, mission card, weather, upcoming
  launches, rotating quick facts.
- Theme system: 7 terminal palettes + 6 polished palettes.
- Layout system: `terminal` and `polished`, orthogonal to themes.
- Hardware portable build: Pi 4 + Waveshare 10.1" + UPS HAT in
  3D-printed case.

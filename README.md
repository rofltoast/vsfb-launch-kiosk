# VSFB Launch Kiosk 🚀📺

> *A 24/7 retro-broadcast TV channel and an ambient launch tracker, all in one
> Vite + React app. Because the only thing more fun than watching SpaceX
> launch a rocket is watching it on a CRT-styled cable channel that you
> built yourself in your garage.*

This is a glorified browser tab that I refuse to admit is a glorified
browser tab. It pulls live data from Launch Library 2, the National
Weather Service, and FlightClub.io, mixes it with hand-tuned retro
typography, ham-radio energy, and a cursed amount of CSS, and pumps
the result onto a 24/7 YouTube Live stream of a fake cable channel.

It also has a normal mode for when you'd like to know when the next
launch is without committing to a full broadcast aesthetic.

---

## What it does (in three flavors)

### 1. `/` — Ambient Mode (the polite one)
The "while-you-wait" view. Big T-minus countdown, GO-FOR-LAUNCH pill,
mission stats, weather card, viewing-conditions score, upcoming-launch
list, rotating quick-fact card. Two layouts to choose from:

- **Terminal** — the original aesthetic. Bracketed `[ TITLE ]` boxes,
  ANSI-flavored palettes, monospace-forward, *btop++ but for rockets*.
- **Polished** — cinematic broadcast vibes. Photo-real Falcon-9-on-pad
  hero behind a giant magenta countdown, glowing GO/NO-GO pill, rounded
  cards. Looks great on a TV.

Press `Y` to flip layouts, `T` for the theme picker, `1`–`7` to jump
straight to a palette. Phones get a 🎨 button bottom-right since
phones don't have a `T` key (sorry, future).

### 2. `/` — Live Mode (the loud one)
Auto-engages 20 minutes before T-0. The trajectory graph becomes the
hero — a real-time altitude-vs-downrange plot drawing in the rocket's
path as it climbs, with event markers (Max-Q, MECO, stage sep, SES-1,
landing burn, SECO, deploy) lighting up as they happen. There's a
small embedded webcast in the corner and a scrolling event log. If
FlightClub is unreachable, it gracefully falls back to a built-in
nominal Falcon 9 ascent profile because *the show must go on*.

### 3. `/retro` — Retro-Broadcast Mode (the unhinged one)
This is the YouTube Live channel. A full-screen CRT-styled "VSFB-TV"
broadcast complete with:

- **Slideshow rotation**: next-launch hero, upcoming schedule,
  Central Coast weather map (5 stations, live NWS data), DID-YOU-KNOW
  fact cards, MGS-style codec portraits of people who definitely work
  at the station (it's me, I'm the people).
- **Bottom ticker** with launch + weather data, brand chyrons, and
  the occasional silly aside.
- **Six "skits"** rendered as video commercials between cycles, with
  a "COMMERCIAL IN PROGRESS" badge so the viewer knows we're not just
  glitching.
- **A 24/7 stream** that pumps this whole thing into YouTube Live via
  a headless Chrome → Xvfb → x11grab → ffmpeg → RTMP pipeline running
  on a tiny VPS.

It also has `/admin/retro`, a recorder for cutting new narration takes
without leaving the browser. Never gets old.

---

## Hardware (a.k.a. why this exists)

This started as a wall-mountable launch ticker for my office. It is
now several things:

- A **portable Pi 4** in a 3D-printed case with a Waveshare 10.1"
  touchscreen and a UPS HAT, so I can take it outside and watch the
  actual rocket while watching a screen show me where the actual
  rocket is. Recursion.
- A **24/7 YouTube Live stream** from a cheap Hetzner VPS so anyone,
  anywhere, can pretend they have a Vandenberg launch monitor in
  their living room.
- A **dev environment** where I add features at 2am and call it
  "production".

Recommended portable build (none of this is required to run the
software — it's a web app, you can open it on a laptop):

| Part | Notes |
|---|---|
| Raspberry Pi 4 (4 GB) | Pi 5 also works; lower power draw on the 4. |
| Waveshare 10.1" HDMI IPS touchscreen | 400+ nits is the bare minimum for outdoor sun. |
| Waveshare UPS HAT (C) + 2× 18650 | Couple hours unplugged + clean shutdown. |
| 3D-printed enclosure | Whatever fits your printer. |

---

## Quick start (the boring 30 seconds)

```bash
git clone https://github.com/ikoniak/vsfb-launch-kiosk.git
cd vsfb-launch-kiosk
npm install
npm run dev
```

Open <http://localhost:5173/>. The data fetches go straight to public
APIs, so there's no `.env` to configure for the basic experience.

For production:

```bash
npm run build
# dist/ is now a static site. Drop it into nginx, Caddy, S3, whatever.
```

For the full retro-broadcast 24/7 stream pipeline (Xvfb + headless
Chrome + ffmpeg → RTMP), see `deploy/` for the systemd unit, the
nginx site config, and the run script. You'll need a YouTube Live
stream key. You'll also need patience. Also coffee.

---

## How it's wired

### Source layout

```
src/
├── App.jsx                 main kiosk app (ambient + live)
├── main.jsx                tiny path-based router (no react-router)
├── components/
│   ├── AmbientView.jsx          chooses terminal vs polished
│   ├── AmbientTerminalLayout    TUI brackets + monospace
│   ├── AmbientPolishedLayout    cinematic broadcast
│   ├── LiveView.jsx             chooses terminal vs polished
│   ├── LivePolishedLayout       trajectory hero + telemetry rail
│   ├── LiveTerminalLayout       same data, TUI flavor
│   ├── TrajectoryGraph.jsx      real-time alt-vs-downrange plot
│   ├── ThemePicker / LayoutPicker / MobileThemeButton
│   └── retro/                   the /retro CRT broadcast app
├── lib/
│   ├── ll2.js                Launch Library 2 client (cached via nginx)
│   ├── flightclub.js         trajectory simulation client
│   ├── weather.js            NWS / Open-Meteo + viewing-score model
│   ├── quick-facts.js        rotating fact pool, both ambient and retro
│   ├── upcoming.js           rideshare grouping, NET parsing
│   └── hooks.js              countdown timers, polling intervals
├── retro/lib/
│   ├── useRetroData.js       LL2 + NWS + facts hook, status-aware
│   ├── nws.js                CWA observations + forecast
│   ├── slots.js              weather-map station list
│   └── useNarration.js       voice clip rotation
└── styles/
    ├── base.css              the kiosk app
    ├── themes.css            13+ palettes, terminal + polished
    └── ../retro/styles/retro.css   the retro-broadcast app
```

### Themes

The theme system is two parallel sets of palettes — **terminal** and
**polished** — applied via `data-theme` and `data-layout` attributes
on `<html>`. Flat ANSI colors for the TUI feel, hand-tuned cinematic
gradients for the polished. Mix and match: "terminal layout +
dracula" and "polished layout + midnight ops" both work, both look
good, neither is correct.

### Data flow

1. **Launch Library 2** — schedule, mission name, rocket, pad, NET,
   landing attempt, status. Polled every 5 minutes. Cached at the
   nginx layer with `proxy_cache_use_stale` so a flaky upstream
   doesn't blank the screen.
2. **National Weather Service** — KLPC observations + LOX gridpoint
   forecast. Drives the Central Coast weather map and the viewing-
   conditions score. Same caching story.
3. **FlightClub.io** — trajectory simulation. Used by the live mode
   to draw the rocket's path. Falls back to a built-in nominal
   Falcon 9 ascent profile if the API errors.
4. **YouTube** — webcast embed. Just an iframe.

### The 24/7 stream pipeline (a.k.a. the cursed part)

Living in `deploy/` and explained more in code comments:

```
              ┌─────────────────┐
              │  /retro SPA     │
              │  (this repo)    │
              └────────┬────────┘
                       │ rendered into
              ┌────────▼────────┐
              │   headless      │
              │   Chrome        │ on Xvfb :99
              └────────┬────────┘
                       │ x11grab
              ┌────────▼────────┐  ← PulseAudio null-sink
              │     ffmpeg      │     captures Chrome audio
              │  libx264 → RTMP │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ YouTube Live    │
              └─────────────────┘
```

Yes, the cursor is invisible. Yes, that took three iterations. Yes,
there's now a 16×16 all-zero XBM bitmap doing the work that
`-nocursor` was supposed to do. Yes, I'm fine.

---

## Keyboard hotkeys (desktop)

| Key | What |
|---|---|
| `T` | toggle theme picker |
| `1`–`7` | jump to palette N (terminal: 7 palettes; polished: 6) |
| `Y` | toggle layout picker |
| `Shift+Y` | flip directly between terminal ↔ polished |
| `L` | mark a "liftoff anchor" (manual T-0 override for testing) |
| `Shift+L` | clear the liftoff anchor |

On mobile the 🎨 button bottom-right cycles themes. There is no `T`
key on a phone. We have made peace with this.

---

## Acknowledgements + apologies

- [The Space Devs](https://thespacedevs.com/) for Launch Library 2.
  Their API is free, fast, and a lifeline.
- [FlightClub.io](https://flightclub.io/) for the trajectory data
  that makes live mode feel real instead of fake.
- The [National Weather Service](https://www.weather.gov/) for an
  API that just *works* and never asks for an account.
- Every single SpaceX webcast caster who's said "stage sep
  confirmed" calmly while a robot landed itself on a boat.

If you find a bug, open an issue with screenshots and your viewport
size. If you build one of these and put it in your office, send a
photo — it'll make my week.

---

## License

MIT. Have fun. Don't impersonate Space Force.

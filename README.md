<div align="center">

![VSFB Launch Kiosk · Upcoming Rocket Launches · Live Telemetry](docs/banner.png)

# VSFB Launch Kiosk

</div>

A browser-based, wall-mountable launch monitor for SpaceX flights from Vandenberg Space Force Base. Calm **ambient mode** by default, automatic flip into **live telemetry mode** ~20 minutes before T-0, and back when it's over.

Built with React + Vite. No backend — pure static SPA pulling from public APIs (Launch Library 2, NWS / Open-Meteo, FlightClub). Runs anywhere a browser does: a TV in your office, a 10" Pi touchscreen on the wall, or the iPad on your kitchen counter.

## At a glance

- Static React + Vite web app, no server required
- Ambient 24/7 next-launch display
- Live ascent + telemetry mode that auto-engages near T-0
- Schedule data from [Launch Library 2](https://thespacedevs.com/llapi)
- Weather from [NWS](https://www.weather.gov/) and [Open-Meteo](https://open-meteo.com/)
- Trajectory simulation from [FlightClub.io](https://flightclub.io/), with a built-in fallback profile
- Optional `/retro` 24/7 broadcast route (YouTube-Live ready)
- Raspberry Pi / kiosk friendly — touch, low memory, multiple resolutions

## Ambient mode

The default view, shown 24/7 except during a live ascent. Pulls the next launch from LL2 and the weather from NWS, mixes in a rotating fact card so the screen has motion, and updates itself in the background.

![Ambient — terminal layout](docs/screenshots/ambient-terminal.png)

**What you see:**

- **Next launch hero** — mission name, rocket, pad, GO / NO-GO pill
- **Big T-minus countdown** — broadcast-clock digits, 24h progress bar
- **Liftoff timestamp** — Pacific time + day-of-week
- **Mission card** — payload, customer, orbit, mission type, pad, recovery
- **Vehicle card** — rocket model + dimensions + thrust + booster reuse stats
- **Weather card** — temp, conditions, wind + compass, cloud cover, viewing score
- **Upcoming launches** — next 6 VSFB flights, with rideshare grouping
- **Rotating fact card** — launch trivia, ~8 second rotation
- **Sonic boom warning** — auto-shown for RTLS landings (booms inland over Lompoc)

### Two layouts, one keypress

Same data, different vibe. Press `Y` to flip.

- **Terminal** — bracketed `[ TITLE ]` boxes, ANSI palettes, monospace. *btop++ but for rockets.*
- **Polished** — cinematic broadcast: photo hero, big magenta countdown, glowing GO pill, rounded cards.

![Ambient — polished layout](docs/screenshots/ambient-polished.png)

Mix and match: 7 terminal palettes (tokyo-storm, gruvbox, dracula, nord, matrix, catppuccin, solarized) and 6 polished palettes (cosmic-dusk, aurora, ember, midnight-ops, graphite, sunrise). Press `T` to open the picker, `1`–`7` to jump straight to a palette. On phones, tap the theme button in the bottom-right.

## Live mode

Auto-engages **20 minutes before T-0** when the launch is `GO`, and runs until ~10 minutes after second-stage SECO. The whole screen rearranges around the trajectory.

![Live — terminal layout](docs/screenshots/live-terminal.png)

**What you see:**

- **Real-time trajectory plot** — altitude vs. downrange, path drawing in as the rocket climbs
- **Mission clock** — `T+00:00:08 · ASCENT`, with the next event countdown highlighted
- **Telemetry rail** — ALT, VEL, downrange, dynamic pressure (Q), stage, status, mode
- **Embedded webcast** — YouTube iframe, no separate tab needed
- **Landing-zone card** — drone ship name (`OCISLY · Of Course I Still Love You`) or LZ designation
- **Event timeline** — every flight event lined up at the bottom, lighting up as they happen
- **Graceful degradation** — if FlightClub is unreachable, falls back to a built-in nominal Falcon 9 ascent profile

Toggle between terminal and polished with `Y`, just like ambient mode.

![Live — polished layout](docs/screenshots/live-polished.png)

## Retro broadcast mode

There's also a hidden `/retro` route that turns the whole thing into a CRT-styled "VSFB-TV" cable channel: slideshow rotation, MGS-style codec portraits, scrolling ticker, rotating commercials. I run it on a tiny VPS pointed at YouTube Live.

If you want to do the same, see [`deploy/stream/README.md`](deploy/stream/README.md) for the systemd unit, the nginx config, the Xvfb + ffmpeg pipeline, and the curse incantations required to make the X cursor invisible. It is entirely optional and unrelated to the main app.

## Quick start

```bash
git clone https://github.com/rofltoast/vsfb-launch-kiosk.git
cd vsfb-launch-kiosk
npm install
npm run dev
```

Open <http://localhost:5173/>. Data fetches go straight to public APIs; no `.env` required for the basic experience.

## Production build

```bash
npm run build
```

`dist/` is now a static site. Drop it into nginx, Caddy, S3, or any static host.

If you want server-side caching for LL2 + NWS (recommended for kiosks pulling on a schedule), see [`deploy/stream/nginx-vsfb-kiosk.conf`](deploy/stream/nginx-vsfb-kiosk.conf) for a reverse-proxy config with cache zones already configured.

## Controls

Desktop hotkeys:

| Key | Action |
|---|---|
| `T` | Toggle theme picker |
| `1`–`7` | Jump to palette N (terminal: 7 palettes; polished: 6) |
| `Y` | Toggle layout picker |
| `Shift+Y` | Flip directly between terminal ↔ polished |
| `L` | Mark a liftoff anchor (manual T-0 override for testing live mode) |
| `Shift+L` | Clear the liftoff anchor |

On mobile the theme button in the bottom-right cycles themes. There is no `T` key on a phone. We have made peace with this.

## Hardware

Recommended portable build. None of this is required — it's a web app, you can open it on a laptop. But the kiosk experience is what makes it fun, and a Pi in a 3D-printed case lets you take it outside to watch the actual rocket while watching the screen show you where the actual rocket is. Recursion.

| Part | Notes |
|---|---|
| Raspberry Pi 4 (4 GB) | Pi 5 also works; lower power draw on the 4. |
| Waveshare 10.1" HDMI IPS touchscreen | 400+ nits is the bare minimum for outdoor sun. |
| Waveshare UPS HAT (C) + 2× 18650 | A few hours unplugged plus clean-shutdown buffer. |
| 3D-printed enclosure | Whatever fits your printer. |

## Project structure

```
src/
├── App.jsx                       main kiosk app (ambient + live)
├── main.jsx                      tiny path-based router (no react-router)
├── components/
│   ├── AmbientView.jsx           chooses terminal vs polished
│   ├── AmbientTerminalLayout     TUI brackets + monospace
│   ├── AmbientPolishedLayout     cinematic broadcast
│   ├── LiveView.jsx              chooses terminal vs polished
│   ├── LivePolishedLayout        trajectory hero + telemetry rail
│   ├── LiveTerminalLayout        same data, TUI flavor
│   ├── TrajectoryGraph.jsx       real-time alt-vs-downrange plot
│   ├── ThemePicker / LayoutPicker / MobileThemeButton
│   └── retro/                    the optional /retro CRT broadcast app
├── lib/
│   ├── ll2.js                    Launch Library 2 client
│   ├── flightclub.js             trajectory simulation client
│   ├── weather.js                NWS / Open-Meteo + viewing-score model
│   ├── quick-facts.js            rotating fact pool
│   ├── upcoming.js               rideshare grouping, NET parsing
│   └── hooks.js                  countdown timers, polling intervals
└── styles/
    ├── base.css                  the kiosk app
    └── themes.css                13 palettes, terminal + polished
```

## Data sources

- **[Launch Library 2](https://thespacedevs.com/llapi)** — schedule, mission, rocket, pad, NET, landing attempt, status. Polled every 5 minutes.
- **[National Weather Service](https://www.weather.gov/)** — KLPC observations + LOX gridpoint forecast. Drives the weather card and the viewing-conditions score.
- **[Open-Meteo](https://open-meteo.com/)** — supplemental weather data, no API key required.
- **[FlightClub.io](https://flightclub.io/)** — trajectory simulation for live mode. Falls back to a built-in nominal Falcon 9 ascent profile if the API errors.
- **YouTube** — webcast embed. Just an iframe.

No backend. The kiosk is a pure static SPA — every fetch goes directly from the browser to the upstream APIs.

## Deployment notes

For self-hosting behind nginx with cached LL2 + NWS proxies (recommended for production kiosks), see [`deploy/stream/nginx-vsfb-kiosk.conf`](deploy/stream/nginx-vsfb-kiosk.conf).

For the optional 24/7 YouTube Live broadcast pipeline (`/retro` route + Xvfb + headless Chrome + ffmpeg → RTMP), see [`deploy/stream/README.md`](deploy/stream/README.md).

## Acknowledgements

- [The Space Devs](https://thespacedevs.com/) for Launch Library 2 — free, fast, and a lifeline.
- [FlightClub.io](https://flightclub.io/) for the trajectory data that makes live mode feel real instead of fake.
- The [National Weather Service](https://www.weather.gov/) for an API that just *works* and never asks for an account.
- Every SpaceX webcast caster who's said "stage sep confirmed" calmly while a robot landed itself on a boat.

If you find a bug, open an issue with a screenshot and your viewport size. If you build one of these and put it in your office, send a photo — it'll make my week.

## License

MIT — use freely. Attribution appreciated. Launch scrub jokes mandatory.

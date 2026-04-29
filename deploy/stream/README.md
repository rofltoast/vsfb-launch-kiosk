# 24/7 Stream Pipeline

Everything needed to broadcast `/retro` to YouTube Live from a tiny
x86 VPS. Tested on Hetzner CPX21 (3 vCPU / 4 GB / Ubuntu 22.04).

## What's in here

| File | Where it goes |
|---|---|
| `setup.sh` | One-time install: nginx + bundle. Run as root. |
| `nginx-vsfb-kiosk.conf` | `/etc/nginx/sites-available/vsfb-kiosk` (sym-link to `sites-enabled/`). Local SPA + reverse proxies for LL2 + NWS APIs (CORS-safe + cache layer). |
| `run.sh` | `/opt/vsfb-stream/run.sh`. The Xvfb + Chrome + ffmpeg pipeline. |
| `vsfb-stream.service` | `/etc/systemd/system/vsfb-stream.service`. systemd unit. |

## Prerequisites on the VPS

```bash
apt-get update && apt-get install -y \
  nginx \
  google-chrome-stable \
  xvfb x11-utils x11-xserver-utils xdotool unclutter-xfixes \
  pulseaudio \
  ffmpeg
```

Drop a 16×16 all-zero XBM at `/opt/vsfb-stream/empty.xbm` (used to
override the X11 root cursor — see `run.sh` for the why):

```bash
cat > /opt/vsfb-stream/empty.xbm <<'EOF'
#define empty_width 16
#define empty_height 16
static unsigned char empty_bits[] = {
   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
EOF
```

## Stream key

Create `/etc/vsfb-stream.env` (mode 600, root:root):

```
YOUTUBE_STREAM_KEY=xxxx-xxxx-xxxx-xxxx-xxxx
KIOSK_URL=http://127.0.0.1:8080/retro?autostart=1
```

## Wire it up

```bash
# 1. Static bundle.
npm run build              # in the repo root
tar czf /tmp/vsfb-dist.tgz -C dist .
scp /tmp/vsfb-dist.tgz root@your-vps:/tmp/
ssh root@your-vps 'bash -s' < deploy/stream/setup.sh

# 2. Stream pipeline.
scp deploy/stream/run.sh root@your-vps:/opt/vsfb-stream/run.sh
scp deploy/stream/vsfb-stream.service root@your-vps:/etc/systemd/system/
ssh root@your-vps 'chmod +x /opt/vsfb-stream/run.sh && systemctl daemon-reload && systemctl enable --now vsfb-stream'

# 3. Watch.
ssh root@your-vps 'journalctl -u vsfb-stream -f'
```

## Why the x86 box and not the Pi?

- Hardware H.264 on the Pi (`h264_v4l2m2m`) was unstable across long
  uptimes — drift, dropped frames, mysterious hangs.
- Software libx264 at `veryfast` + `zerolatency` baseline on a 3-vCPU
  Hetzner box holds 1280x720 @ 30fps with headroom and never drifts.
- The Pi is reserved for its actual job: running the on-site kiosk
  on a real screen for humans to look at.

## Cursor invisibility

The X server has its own root-window cursor sprite that `Xvfb -nocursor`
does NOT suppress. Three layers solve it:

1. `xsetroot -cursor empty.xbm empty.xbm` (root cursor)
2. `unclutter-xfixes -idle 0 --fork` (Chromium-managed cursor)
3. `xdotool mousemove 9999 9999` (park the pointer offscreen)
4. `ffmpeg -draw_mouse 0` (final defense — strips the X cursor from
   the captured frame)

A background loop re-applies `xsetroot` + `xdotool` every 10s
because Chromium keeps resetting the root cursor on window creation.

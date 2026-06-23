# GUNBALD

A roguelike artillery brawl (Canvas + vanilla JS, no build step) with single-player vs AI **and online 1v1 PvP**.

## Run locally
Any static file server works for single-player, e.g.:
```
python -m http.server 8123
```
For **online PvP** you must use the bundled server (it adds matchmaking + a WebSocket relay):
```
node server.js
```
Then open http://localhost:8123. Open it in **two** browser windows and click **PLAY ONLINE** in both — the first two players are matched into a duel.

> Online play needs `node server.js` (the static python server has no WebSocket). Requires Node 18+. **Zero dependencies** — no `npm install` needed.

## Deploy on a VPS
1. Copy the whole folder to the VPS.
2. Run it (pick a port; 8123 by default):
   ```
   PORT=8123 node server.js
   ```
   Keep it alive with a process manager, e.g. `pm2 start server.js --name gunbald` or a systemd unit.
3. Point a domain / reverse proxy at it. If you terminate TLS in front (nginx/Caddy), **forward WebSocket upgrades** so `wss://` works. Example nginx location:
   ```nginx
   location / {
     proxy_pass http://127.0.0.1:8123;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
   }
   ```
   The client auto-selects `ws://` or `wss://` based on the page's protocol, so serving the page over HTTPS just works.

## How online works
- The server only does matchmaking + relays JSON between the two matched peers.
- Each match is **turn-authoritative**: the host seeds an identical battlefield on both clients; the player whose turn it is simulates their shot and sends the authoritative result (craters + HP + positions), which the opponent applies. This keeps both clients perfectly in sync without lockstep.
- PvP is an escalating duel: both pick an opening mega-upgrade, a coin-flip decides who fires first (the second shooter's first shot deals 2× damage), then you trade shots — picking a small upgrade each turn (a mega every 5th) — until one SPLONK is destroyed.

## Project layout
- `index.html`, `style.css` — shell + styles
- `js/core.js` — math, RNG, input, storage, tuning constants
- `js/terrain.js` — destructible pixel-mask terrain
- `js/data.js` — minor/mega upgrades, combos, enemies, bosses, milestones
- `js/entities.js` — SPLONK, projectiles, particles
- `js/ai.js` — single-player enemy shot planner
- `js/net.js` — WebSocket client (online)
- `js/ui.js` — HUD + HTML panels
- `js/game.js` — state machine, main loop, online integration
- `server.js` — static host + WebSocket matchmaking/relay (zero-dep)

# OnlineJourno Installer

A downloadable, WordPress-style installer for self-hosting OnlineJourno products. No command line required after the first click.

## What it does

1. Checks that Docker and Node.js are installed.
2. Asks which OnlineJourno product you want to run.
3. Collects a few details: newsroom name, admin email/password, ports, and an optional LLM key.
4. Writes a local `.env` file and runs `docker compose up --build`.
5. Creates your first newsroom tenant and admin account.
6. Opens your new OnlineJourno instance in the browser.

## Requirements

- **Docker + Docker Compose** (Docker Desktop on macOS/Windows, or Docker Engine on Linux).
- **Node.js 18+** (usually installed with Docker Desktop; otherwise download from [nodejs.org](https://nodejs.org/)).

## Quick start

1. Download `onlinejourno-installer.zip` from [onlinejourno.com](https://onlinejourno.com).
2. Extract the zip anywhere you want your OnlineJourno files to live.
3. Run the launcher:
   - **macOS / Linux:** double-click `start.sh`, or run `./start.sh` in Terminal.
   - **Windows:** double-click `start.bat`.
4. Your browser opens to `http://127.0.0.1:7000`. Follow the wizard.

## Products

Newsroom requires a licence key to install. Request one from [onlinejourno.com/contact](https://onlinejourno.com/contact/). All other proprietary products are available on request.

| Product | Status | Licence | Live URL | Repo |
|---|---|---|---|---|
| OnlineJourno Newsroom | Available | Proprietary | [app.onlinejourno.com](https://app.onlinejourno.com) | private |
| The Audit | Consulting only | Proprietary | — | private |
| Daybook | Available | FSL | [daybook.onlinejourno.com](https://daybook.onlinejourno.com) | public |
| Galley | Available | FSL | [galley.onlinejourno.com](https://galley.onlinejourno.com) | public |
| Frontmatter | Available | FSL | [frontmatter.onlinejourno.com](https://frontmatter.onlinejourno.com) | public |
| Dispatch | Available | FSL | [dispatch.onlinejourno.com](https://dispatch.onlinejourno.com) | public |
| Bureau | Available | FSL | [bureau.onlinejourno.com](https://bureau.onlinejourno.com) | public |
| Watches | Request access | Proprietary | [watches.onlinejourno.com](https://watches.onlinejourno.com) | private |
| Loupe | Request access | Proprietary | [loupe.onlinejourno.com](https://loupe.onlinejourno.com) | private |
| Pulse | Request access | Proprietary | [onlinejourno.com/in](https://onlinejourno.com/in) | private |
| Tare | Available | MIT | [tools.onlinejourno.com/tare](https://tools.onlinejourno.com/tare) | public |
| Forage | Available | MIT | [tools.onlinejourno.com/forage](https://tools.onlinejourno.com/forage) | public |

**Note:** Daybook, Galley, Frontmatter, Dispatch, Tare and Forage are all installable via the wizard. Each repo's `main` branch now includes a `docker-compose.yml` that honours the `WEB_PORT` environment variable.

## Where your data lives

Everything stays on your machine:

- The installer UI runs locally at `127.0.0.1:7000`.
- Generated config is written to `.env` in the product folder.
- Postgres data lives in a Docker volume named `pgdata`.
- No analytics, telemetry, or secrets leave your computer.

## Customising the install

Advanced users can still self-host manually:

```bash
cp .env.example .env
# edit .env
docker compose up --build
```

See `SELF-HOST.md` in the product repository for production settings.

## Troubleshooting

**Docker not found?**  
Install [Docker Desktop](https://docs.docker.com/get-docker/) (macOS/Windows) or Docker Engine + Compose (Linux), then restart the installer.

**Port 3000 already in use?**  
Choose a different web port in the wizard (e.g. 3001).

**Installation fails during build?**  
Make sure Docker Desktop is running and has enough disk space. The first build downloads Node and Postgres images.

## Licence

The installer is released under the MIT Licence. It downloads and runs OnlineJourno products under their own licences.

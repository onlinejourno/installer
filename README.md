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

| Product | Status | Notes |
|---|---|---|
| OnlineJourno Newsroom | Available | Flagship editorial-intelligence desk. |
| Dispatch | Coming soon | Editorial-intelligence dashboard (FSL). |
| Tare | Coming soon | MIT privacy-and-bloat analyser. |
| Forage (Crawl-Budget Analyser) | Coming soon | MIT crawler-budget reporter. |
| Pulse | Request access | Proprietary curated digest and briefing. |

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

This installer is part of the OnlineJourno platform and is licensed under the same terms as the flagship product (FSL-1.1, converting to Apache 2.0 after two years).

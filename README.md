# OnlineJourno Installer

A downloadable, WordPress-style installer for running OnlineJourno's open-source tools on your own machine. No command line required after the first click.

**Scope:** only the MIT-licensed tools are installable. The rest of the OnlineJourno suite is commercial software, is not source-available, and is not offered for self-hosting — those products are used as hosted services.

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

Only Tare is installable today. Every other product in the table below is commercial software with a private repository: the wizard cannot fetch it, and self-hosting is not offered for it. Those products are reached as hosted services at the URLs given, or by arrangement — [onlinejourno.com/contact](https://onlinejourno.com/contact/).

| Product | Status | Licence | Live URL | Repo |
|---|---|---|---|---|
| OnlineJourno Newsroom | Hosted service | Proprietary | [app.onlinejourno.com](https://app.onlinejourno.com) | private |
| The Audit | Consulting only | Proprietary | — | private |
| Daybook | Hosted service | Proprietary | [daybook.onlinejourno.com](https://daybook.onlinejourno.com) | private |
| Galley | Hosted service | Proprietary | [galley.onlinejourno.com](https://galley.onlinejourno.com) | private |
| Frontmatter | Hosted service | Proprietary | [frontmatter.onlinejourno.com](https://frontmatter.onlinejourno.com) | private |
| Dispatch | Hosted service | Proprietary | [dispatch.onlinejourno.com](https://dispatch.onlinejourno.com) | private |
| Bureau | Hosted service | Proprietary | [bureau.onlinejourno.com](https://bureau.onlinejourno.com) | private |
| Watches | Request access | Proprietary | [watches.onlinejourno.com](https://watches.onlinejourno.com) | private |
| Loupe | Request access | Proprietary | [loupe.onlinejourno.com](https://loupe.onlinejourno.com) | private |
| Pulse | Request access | Proprietary | [onlinejourno.com/in](https://onlinejourno.com/in) | private |
| Tare | Installable | MIT | [tools.onlinejourno.com/tare](https://tools.onlinejourno.com/tare) | public |
| Forage | Not yet installable | MIT | [tools.onlinejourno.com/forage](https://tools.onlinejourno.com/forage) | public |

**Note:** Forage is MIT and its repository is public, but the wizard still points at the old private `tools` repository, so it does not install yet. Tare is the only product the wizard can complete today.

## Where your data lives

Everything stays on your machine:

- The installer UI runs locally at `127.0.0.1:7000`.
- Generated config is written to `.env` in the product folder.
- Postgres data lives in a Docker volume named `pgdata`.
- No analytics, telemetry, or secrets leave your computer.

## Customising the install

For the MIT tools, you can skip the wizard and run them directly:

```bash
cp .env.example .env
# edit .env
docker compose up --build
```

This applies to Tare and Forage only. The commercial products have no public
repository and no self-host path.

## Troubleshooting

**Docker not found?**  
Install [Docker Desktop](https://docs.docker.com/get-docker/) (macOS/Windows) or Docker Engine + Compose (Linux), then restart the installer.

**Port 3000 already in use?**  
Choose a different web port in the wizard (e.g. 3001).

**Installation fails during build?**  
Make sure Docker Desktop is running and has enough disk space. The first build downloads Node and Postgres images.

## Licence

The installer is released under the MIT Licence. It downloads and runs OnlineJourno's MIT-licensed tools under their own licences.

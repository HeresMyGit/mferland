# Mac Prod Server Autoboot

This repo includes a small macOS launchd service kit for the prod-style mferland game server.

It runs:

```sh
HOST=0.0.0.0 MFERLAND_SERVE_WEB_DIST=1 npm run start -w @mferland/server
```

That serves the built web app and Colyseus server from `http://127.0.0.1:2567`. Cloudflare Tunnel can point at that same local URL.

## What Gets Installed

- LaunchAgent label: `com.mferland.launch`
- LaunchAgent file: `~/Library/LaunchAgents/com.mferland.launch.plist`
- Logs:
  - `~/Library/Logs/mferland/prod-server.log`
  - `~/Library/Logs/mferland/prod-server.err`
- Helper script: `scripts/mferland-prod-server.sh`
- Double-click launcher: `scripts/Mferland Prod Server.command`

The LaunchAgent has `RunAtLoad` and `KeepAlive`, so it starts when the `mfergpt` user logs in and restarts if the server crashes. It does not start before macOS login. If the machine must serve traffic before any user logs in, convert this to a system LaunchDaemon later.

## One-Time Install

From the repo root:

```sh
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh install
./scripts/mferland-prod-server.sh status
```

The installer also removes the old ad hoc `local.mferland.server` submitted job because that job can collide with port `2567`.

## Day-To-Day Commands

```sh
./scripts/mferland-prod-server.sh status
./scripts/mferland-prod-server.sh logs
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh stop
./scripts/mferland-prod-server.sh start
./scripts/mferland-prod-server.sh uninstall
```

`stop` only stops the service for the current login session. Since the plist stays installed, it will come back at the next login. Use `uninstall` if you want to remove the autoboot service.

## Double-Click Launcher

Double-click:

```txt
scripts/Mferland Prod Server.command
```

It installs the LaunchAgent if needed, otherwise restarts it, then tails the logs in Terminal. Closing that Terminal window does not stop the server.

For convenience, you can put a symlink on the Desktop:

```sh
ln -sf "/Users/mfergpt/dev/mferland/scripts/Mferland Prod Server.command" "$HOME/Desktop/Mferland Prod Server.command"
```

## Updating The Running Prod Build

After pulling or editing code:

```sh
npm install
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh status
```

The launchd service intentionally runs the already-built `dist` output. Build first, then restart.

The helper's `build` command builds the shared package, server, and web app. It does not build the optional headless agent runner because the prod game server does not need it to boot.

## Reboot Check

After rebooting and logging back into the `mfergpt` account:

```sh
./scripts/mferland-prod-server.sh status
curl -I http://127.0.0.1:2567/
```

Healthy output should show `Health: OK` and an HTTP `200 OK`.

## Troubleshooting

If health fails, inspect:

```sh
./scripts/mferland-prod-server.sh logs
```

If the log says port `2567` is already in use, check listeners:

```sh
lsof -iTCP:2567 -sTCP:LISTEN -nP
```

If the log says prod build output is missing, rebuild:

```sh
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh restart
```

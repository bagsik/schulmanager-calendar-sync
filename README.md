# Schulmanager to Google Calendar Sync

This project runs a small Docker service that reads a Schulmanager Online
timetable and writes the resulting events directly into Google Calendar with
the Google Calendar API.

There is no public timetable endpoint; Google Calendar is updated through the API.

## Runtime Files

- `.env` - runtime configuration and secrets. Do not share it.
- `data/google-service-account.json` - Google service account key.
- `data/token-store.json` - refreshed Schulmanager bearer token, if returned by Schulmanager.
- `data/schedule.json` - latest normalized timetable snapshot for debugging.
- `data/status.json` - latest sync status snapshot.

## Main Code

- `server.mjs` - starts the long-running service, exposes local `/health`, and schedules sync every 30 minutes.
- `src/schulmanager-api.mjs` - calls the Schulmanager JSON API.
- `src/sync.mjs` - runs the Schulmanager fetch and writes local status/schedule snapshots.
- `src/schedule-events.mjs` - converts Schulmanager lessons into normalized events.
- `src/google-calendar-sync.mjs` - inserts, updates, deletes, or skips Google Calendar events.
- `src/timezone.mjs` - converts Europe/Berlin lesson times to RFC3339 values for Google Calendar.
- `src/token-store.mjs` - stores refreshed Schulmanager bearer tokens.
- `src/date-range.mjs` - computes the rolling sync window.

## Current Behavior

- Sync interval: every 30 minutes.
- Window: two weeks back through two weeks forward.
- Google Calendar sync: enabled.
- Events are managed by stable IDs, so repeated syncs skip unchanged events.
- Google event titles are formatted as `(room) subject`.
- The same room is also written to the Google event location field.

## Commands

Check syntax:

```bash
npm run check
```

Rebuild and restart:

```bash
docker compose up -d --build --force-recreate
```

View logs:

```bash
docker compose logs -f schulmanager-calendar
```

Check health:

```bash
curl -i http://127.0.0.1:18080/health
```

## Security

The Google service account key and Schulmanager token are secrets. Keep them in
`.env` or `data/`, not in source files.

# Praise Bot App (powered by the JavaScript Bolt Framework)

## General Information and Overview
This repository stores all code for the development of the Praise Bot App activated by the **/praise** slash command on the Opportunity Hack Slack workspace.

To learn the more about the Bolt Framework for the development of Slack apps, read or learn more at the following: 
- [GitHub for Bolt-JS Development](https://github.com/slackapi/bolt-js)
- [Guides or Walkthrough on Bolt for JavaScript](https://tools.slack.dev/bolt-js/).

---

## Local Development Setup Steps:

1. Choose a folder and clone the ohack-slack-bot repository into the directory 
of your local machine
2. cd into the **praise-bot** folder
3. Install node into your machine using the command 'nvm install node'
4. Run the command **npm install @slack/bolt** to install the bolt framework locally
6. To set the required .env variables, follow the steps provided in [How to set environment variables](#How-to-set-environment-variables)
5. Type **node app.js** in your terminal to run the Slack Praise Bot App locally. 
6. To ensure that the app successfully starts, look for the message "⚡️ Bolt app is running!" at the end of your console terminal output
7. On Slack, type **/praise-dev** to trigger the development version of the Slack Praise Bot. DO NOT use **/praise**, as this will run the production version of the Slack Praise Bot. 


**NOTE:** To make sure that your local slack bot executes any local code changes, press `<CTRL> + C` to end the process, save your changes, and then repeat Step 6 above to run the app with any updated code changes.

---

## How to set environment variables

Set the following environment variables for local development
- SLASH_CMD='/praise-dev'
- DEBUG_MODE=true
- To set the SLACK_APP_TOKEN and SLACK_BOT_TOKEN, message Greg for access to the **Praise Bot Dev** on api.slack.com/apps and follow these steps to access the values when you click on **Praise Bot Dev**:
    - SLACK_APP_TOKEN: Click on 'Basic Information' > Scroll Down to App-Level Token > Click 'Generate Token and Scopes' > Click 'app dev token' > Copy the token value
    - SLACK_BOT_TOKEN: Click on 'OAuth & Permissions' > Scroll to OAuth Tokens > Click 'Copy' button in text box for Bot User OAuth Token
    - BACKEND_PRAISE_URL and BACKEND_PRAISE_TOKEN: Contact **Greg Vannoni** on the Opportunity Hack slack workspace for the values

---

## Deploying

The bot runs on Fly.io as `praise-bolt-app` (`fly.toml`, `Dockerfile`). Deploys are automatic: `.github/workflows/praise-bot.yml` runs `npm test` on every PR and push touching `praise-bot/`, and on `main` it runs `flyctl deploy --remote-only`. It needs a `FLY_API_TOKEN` repo secret (app-scoped: `fly tokens create deploy -a praise-bolt-app`); without it the deploy step logs a warning and skips. Manual deploy: `cd praise-bot && fly deploy --remote-only`.

## repo-tpm: Daily GitHub Digest

The `repo-tpm/` module posts a GitHub status digest to each active team's Slack channel.

**Layout.** The channel message is the TL;DR: one block per repo with a scoreboard line and up to 5 bullets for what shipped — merged PRs and commits pushed straight to `main`/`develop`/any branch without a PR (commits on the default branch plus any branch pushed in the window; PR merges, merge commits, PR-branch work and bot commits are filtered out). Each repo then gets one thread reply, headed by the repo name, with the AI narrative, Wins (with a description excerpt), Direct pushes, Unowned issues, Stalled PRs, Portfolio corner, Activity, and AI risks/kudos. Quiet repos get a one-line reply and skip the LLM call.

**Lookback window.** Defaults to 25h for the daily digest. For hourly hackathon digests set `digest.window_hours: 1` on the watcher in remote config (or `DIGEST_WINDOW_HOURS` for the env fallback) and a matching `digest.cron`; copy adapts ("since yesterday" → "in the last hour").

**Reactions.** ✋ on a thread reply claims the issues listed in it; ✅/👀 mutes their nudges. Every digest posted in the last 3 days is scanned (max 30), so hourly runs keep claims.

The digest thread includes a **💼 Portfolio corner** that coaches junior devs on PR descriptions (blank/thin bodies on open or recently merged PRs, missing issue links — their open-source PRs are portfolio material for recruiters), and tags well-documented merged PRs with "📝 great write-up!" in Wins. Rule-based (no LLM); disable via `global.portfolio_coaching: false` in remote config.

### Additional Slack app scopes required

Add these scopes to the bot token in api.slack.com/apps → OAuth & Permissions:
- `channels:read` — list channels to resolve channel names
- `channels:join` — join team channels before posting
- `channels:history` — read prior bot messages for reaction tracking
- `reactions:read` — read ✋/✅/👀 reactions on nudge lines
- `reactions:write` — add 🎉 reaction to parent when wins exist

### New environment variables

Set via `fly secrets set` for production:
- `EVENT_ID` — hackathon event ID (default: `summer-2026`)
- `GITHUB_TOKEN` — read-only classic PAT with `public_repo` scope (optional but avoids rate limits)
- `DIGEST_CRON` — cron schedule in UTC (default: `0 16 * * *` = 9 AM Arizona)
- `DIGEST_WINDOW_HOURS` — lookback for merges/commits/activity (default: `25`; use `1` with an hourly cron). Remote config `digest.window_hours` overrides it.
- `DIGEST_DRY_RUN=1` — print Block Kit JSON to stdout instead of posting (use to verify before first live run)

### New Slack slash command

Register `/repo-status` in the Slack app manifest (same setup as `/praise`). It runs the digest on demand from any team channel.

---

## calendar-reminders: Google Calendar → Slack event reminders

The `calendar-reminders/` module polls a **public** Google Calendar (via its ICS feed — no Google API key needed) and posts a reminder to one or more Slack channels shortly before each event starts. Default: the [OHack public calendar](https://www.ohack.dev/office-hours), 15 minutes before, into `#general`.

Recurring events (weekly office hours etc.) are expanded correctly, including cancelled/rescheduled occurrences; all-day events are skipped. Each occurrence is announced once (in-memory dedupe — a bot restart inside the lead window may rarely repeat one reminder).

Each reminder includes an *Add to your calendar* link (pre-filled Google Calendar event) and a *Subscribe to all events* link (adds the whole public calendar to the reader's Google Calendar).

### Environment variables (all optional)

- `CALENDAR_ID` — public Google Calendar ID (default: OHack public calendar)
- `CALENDAR_CHANNELS` — comma-separated channel names or IDs (default: `general`)
- `CALENDAR_LEAD_MINUTES` — minutes before event start to post (default: `15`)
- `CALENDAR_POLL_CRON` — poll schedule (default: `*/5 * * * *`; keep the interval well under the lead time)
- `CALENDAR_EVENTS_URL` — "full schedule" link in the message (default: `https://www.ohack.dev/office-hours`)
- `CALENDAR_DRY_RUN=1` — print reminders to stdout instead of posting

Uses the same `channels:read` scope as repo-tpm to resolve channel names; the bot must be a member of the target channels (or have `chat:write.public`).

---

## Remote config: manage everything from ohack.dev/admin/praise-bot

All bot *behavior* (which GitHub repos/hackathons to watch, which Slack channels
to post to, cron schedules, feature toggles) is managed from the
**Praise Bot** tab at [ohack.dev/admin](https://ohack.dev/admin/praise-bot) —
no Fly.io env-var changes or redeploys needed. Only *secrets* stay in env vars.

How it works:
- Config lives in the `praise_bot_config` Firestore collection on the backend.
- The bot polls `GET /api/praise-bot/config` (authed by `X-Api-Key`) every
  `CONFIG_POLL_SECONDS` (default 60s) and re-registers its cron jobs when
  anything changed (`scheduler.js` + `remote_config.js`).
- If the backend is unreachable or has no config docs yet, the bot falls back
  to its last-good config, then to the env vars documented above — a fresh
  deploy with no admin config behaves exactly like the old bot.

Config-related env vars:
- `BACKEND_CONFIG_TOKEN` — API key for the config endpoint (falls back to
  `BACKEND_PRAISE_TOKEN` if unset)
- `BACKEND_CONFIG_URL` — override the endpoint (default:
  `https://api.ohack.dev/api/praise-bot/config`; useful for local backend testing)
- `CONFIG_POLL_SECONDS` — poll interval (default `60`)

The admin UI supports multiple **GitHub watchers** (each with its own repos or
hackathon event, channels, digest cron, and optional mentor rollup), multiple
**calendar reminders**, the **community** features below, and global
dry-run/LLM/timezone settings.

---

## community: #introductions matchmaker + weekly digest

The `community/` module drives Slack engagement (enable in
/admin/praise-bot → Community; keep **dry run** on for the first week and
watch `fly logs`):

- **Intro matchmaker** — when someone posts a real introduction in the intro
  channel, the bot replies *in-thread* with a warm welcome and up to
  `max_matches` "you might want to meet" suggestions, matched against earlier
  intros (keyword prefilter + LLM ranking; fails open to a plain welcome).
- **Weekly community digest** — posts "new faces this week" with @mentions and
  common themes to a configured channel on its own cron.

Only public messages from the intro channel are used. Requires the
`message.channels` event subscription (already in `manifest.json`). Note: on
Slack's free plan the API only returns ~90 days of history, so matches come
from recent intros.

---

## Questions and Concerns

If any issues arise when setting up the development version of the Praise Bot, join the Opportunity Hack Slack workspace to post a message in the #slack-bot-dev channel or send a direct message to *Andrew Nguyen* or *Greg Vannoni* for assistance.

If you see any functional defects while sending praises to OHack Slack workspace members, message in the #slack-bot-dev channel of the OHack Slack workspace or log an issue at [GitHub Issues](https://github.com/opportunity-hack/ohack-slack-bot/issues)
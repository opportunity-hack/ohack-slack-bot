# repo-tpm: Daily GitHub Status Digest for Hackathon Teams

Implementation spec. Written for handoff to an implementing agent (Sonnet 4.6): follow phases in order, each phase is independently shippable, do not start a phase until the prior one's acceptance criteria pass.

## Locked decisions (do not revisit)
- **Runtime**: extend `praise-bot/` (Bolt.js, Socket Mode, Fly.io). Daily job via `node-cron` inside the existing container. No new deployment target.
- **GitHub access**: read-only classic PAT in env `GITHUB_TOKEN` (public_repo read). **The bot never writes to GitHub** — no comments, no assignments, no labels.
- **Identity mapping**: new backend endpoint (separate repo, Phase 0) maps GitHub username → Slack user ID for @-mentions. Fallback: plain-text GitHub handle.
- **Nudge scope**: team's own Slack channel only. Never DM anyone.
- **Cost**: core feature uses zero LLM calls. LLM layer (Phase 4) activates only when `OPENAI_API_KEY` is set and fails open to rules-only output.

## Data sources (all verified working 2026-07-06)
1. `GET https://api.ohack.dev/api/messages/hackathons` → find object where `event_id == process.env.EVENT_ID` (`summer-2026`) → gives `teams[]` (list of team IDs), `timezone`, `start_date`, `end_date` (2026-06-12 → 2026-07-31), `github_org`.
2. `GET https://api.ohack.dev/api/messages/team/{id}` → `team.github_links[].link`, `team.slack_channel` (a channel **name**, e.g. `2026_summer_wial`, not an ID), `team.users[]` (name, nickname, user_id), `team.name`, `team.active`.
3. GitHub REST v3 (header `Authorization: Bearer $GITHUB_TOKEN` when set):
   - `GET /repos/{owner}/{repo}/issues?state=open&per_page=100` — NOTE: includes PRs; a PR has a `pull_request` key, an issue does not. Split on that.
   - `GET /repos/{owner}/{repo}/issues?state=all&since={ISO 25h ago}&per_page=100` — everything touched in the last day (comments count as touches).
   - `GET /repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc&per_page=50` — gives `merged_at`, `draft`, `requested_reviewers`.
   - Budget: ≤20 calls per run total. No pagination loops beyond 3 pages per endpoint.

## Phase 0 — Backend identity endpoint (repo: `/Users/gregv/dev/fresh_ohack/backend-ohack.dev`)
- Add `GET /api/users/github/<github_username>` in `api/users/users_views.py` (+ matching service function in `services/users_service.py`).
- Lookup: user document where `github == <github_username>` (case-insensitive compare). Field already exists: `model/user.py` line 28 (`github = ""`, in `metadata_list`).
- Response: `{ "slack_user_id": "U..." }` or 404. **Return nothing else** — `github` is in `privacy_fields`; do not leak profile data.
- **Slack ID resolution (verified against real data — do it exactly this way)**. `user.user_id` comes in three formats: `oauth2|slack|T1Q7936BH-U...` (majority), `oauth2|google-oauth2|...` (Google sign-ins, ~1/3 of current users), and possibly legacy raw `U...`. All the plumbing already exists in `common/utils/oauth_providers.py`:
  1. `sid = extract_slack_user_id(user.user_id)` — returns the raw `U...` for Slack-form IDs, returns input unchanged otherwise. Accept it if it matches `^[UW][A-Z0-9]{5,}$` (covers both Slack-form and legacy raw IDs).
  2. If not a Slack ID (Google-auth user): resolve server-side via Slack `users.lookupByEmail(user.email_address)` using the existing `WebClient`/`SLACK_BOT_TOKEN` pattern in `common/utils/slack.py`. The email never leaves the backend. Cache hits back onto nothing — just return the resolved `U...`. **Check first** that the backend's Slack token has the `users:read.email` scope; if it doesn't, add it, or skip this step and return 404 for Google-auth users.
  3. No user with that github handle, or no resolution → 404.
- Acceptance: curl for a known linked user returns their `U...` ID; unknown username → 404; endpoint requires no auth beyond what sibling public endpoints use.

## Phase 1 — Core daily digest (praise-bot, no LLM)
New directory `praise-bot/repo-tpm/`:
- `config.js` — env: `EVENT_ID`, `GITHUB_TOKEN`, `DIGEST_CRON` (default `0 16 * * *` UTC ≈ 9:00 AM America/Phoenix), `DIGEST_DRY_RUN`.
- `ohack_api.js` — fetch hackathon + teams (steps 1–2 above). Skip teams where `active != "True"` or `github_links` empty.
- `github.js` — fetch + classify (steps 3 above). Pure fetch, no rendering.
- `rules.js` — pure functions, no I/O (unit-test these):
  - `unowned(issue)`: open, no assignees.
  - `stalledPR(pr, now)`: open, not draft, `updated_at` > 48h ago. Tier by age: 2–4d gentle, 4–7d firmer, >7d "needs a decision: finish, split, or close?"
  - `wins(since)`: PRs with `merged_at` in window; issues closed in window.
  - `touched(since)`: issues/PRs updated in window with actor summary.
  - Template variation: keep 3 phrasings per nudge type, select by `(dayOfYear + itemNumber) % 3` so consecutive days don't repeat verbatim. No stored state.
- `render.js` — Block Kit. **Parent message** = one-line scoreboard per repo: `📊 {repo} — {n} open issues ({x} 🔴 unowned) · {m} open PRs ({y} ⚠️ stalled) · {z} merged since yesterday 🎉`. **Thread replies** (in order): wins/celebration, unowned issues, stalled PRs, touched-yesterday one-liners. Every item links to the GitHub URL. Point person = assignee, else PR author, else "unowned".
  - Zero-activity day: parent says so plus one gentle "no commits or updates in 24h — blocked on anything? Ask in this channel or grab a mentor" line. Still post it (silence is the signal a TPM acts on).
- `digest.js` — orchestrator: resolve `slack_channel` name → ID via `conversations.list` (paginate, cache in memory), `conversations.join` if not a member, post parent, post thread replies, bot adds 🎉 reaction to its own parent when `z > 0`.
- Wire-up in `praise-bot/app.js`: register cron on startup; skip runs after hackathon `end_date + 3 days`. `DIGEST_DRY_RUN=1` prints blocks JSON to stdout instead of posting (use this to verify before first real post).
- New Slack scopes needed on the praise-bot app: `channels:read`, `channels:join`, `channels:history`, `reactions:read`, `reactions:write` (chat:write already present). Document in `praise-bot/README.md` and note `fly secrets set` for new env vars.
- Acceptance: dry-run against summer-2026 renders correct counts for `2026-ASU-WiCS-Opportunity-Hack/03-nanpossible` (spot-check against github.com); live run posts one parent + threaded details in `#2026_summer_wial`; second run same day produces sane "since" window (25h overlap is intentional).

## Phase 2 — Interactivity
- **Find prior digest statelessly**: `conversations.history` filtered to the bot's own user ID, most recent message whose text starts with `📊` → that ts is yesterday's parent; `conversations.replies` gives the nudge lines.
- **✋ claim**: at render time, read reactions on yesterday's nudge lines (`reactions.get`). If a nudge line for issue #N has ✋ from user U, today's digest lists U as point person for #N ("✋ claimed by <@U>") instead of re-nudging.
- **✅ / 👀 ack**: same mechanism; acked item is suppressed from nudges for 3 days (encode issue number + ack date in the line's hidden metadata — put `#N` in the text and derive date from the message ts; no database).
- **`/repo-status`** slash command: registered like the existing `/praise` handler in `app.js`; matches invoking channel → team (by resolved channel ID) → runs the same digest pipeline on demand, replies in-channel.
- **@-mentions**: for each GitHub login appearing as assignee/author, call the Phase 0 endpoint (in-memory cache, 24h TTL); on hit render `<@U...>`, on miss render `` `github-handle` ``. Never guess.
- Acceptance: react ✋ on a nudge, next `/repo-status` shows the claim; slash command works in the team channel and errors politely elsewhere.

## Phase 3 — Weekly mentor rollup (optional, after 1–2 works)
- Monday run (second cron), posts to env `MENTOR_CHANNEL` (ask Greg for the channel when wiring this): one table row per team — merged PRs (7d), open/unowned issues, stalled PRs, last-activity age. Flag 🚩 any team with zero repo activity in 72h.
- Purpose: feeds the `repo_health_checked` mentor-checklist item that currently sits unchecked.

## Phase 4 — LLM layer (only if `OPENAI_API_KEY` set)
- Mirror the pattern in `news-gen/functions/gen_news.ts` (single `gpt-4.1-mini` call, structured JSON output), but implemented in praise-bot's Node code.
- Input: the compact facts JSON already produced by `rules.js` (never raw diffs). Output schema: `{ narrative: string (≤2 sentences), risks: string[] (≤3), kudos: string[] (≤2) }`.
- Rendered as: narrative appended to parent; risks/kudos as one extra thread reply. Examples of risks it can catch that rules can't: two open PRs touching the same area, PR title unrelated to its linked issue, vague issue descriptions.
- Hard failure rule: any API error, timeout (10s), or schema mismatch → log and render rules-only. The digest must never fail or stall because of the LLM.
- Cost ceiling: 2 teams × 1 call/day ≈ well under $1/month at gpt-4.1-mini rates.

## Guardrails (apply to every phase)
- No GitHub write operations, ever.
- No DMs; all posts go to team channels (or `MENTOR_CHANNEL` in Phase 3).
- Fail soft per team: one team's bad repo/channel must not block other teams' digests (try/catch per team, log and continue).
- Respect rate limits: single fetch pass per run, no polling.
- Tests: unit-test `rules.js` and `render.js` with fixture JSON captured from the real repo (no network in tests). Existing repo has no test framework in praise-bot — add the lightest option (node:test).
- Everything configurable via env; no hardcoded channel IDs (the news-gen hardcoded-channels pattern is what we're avoiding).

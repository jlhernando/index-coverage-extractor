# CLAUDE.md

## Project Overview

**Google Search Console Index Coverage Extractor** (v3.1.1) — A Node.js script that automates the extraction of Index Coverage and Sitemap Coverage reports from Google Search Console (GSC) using Playwright browser automation with system Chrome.

Author: Jose Luis Hernando | License: MIT | Runtime: Node.js (ESM, v20+)

## Architecture & Key Files

| File | Purpose |
|------|---------|
| `index.js` | Main script — single async IIFE (~641 lines). Handles login, scraping, and output. |
| `utils.js` | Utility functions: `friendlySiteName`, `formatDate`, `currentDate`, `jsonToCsv`. |
| `credentials.js` | Exports `email`, `pass`, `site` — user fills in GSC credentials (or leaves blank for terminal prompts). |
| `report-names.js` | Maps GSC internal report IDs (e.g. `CAMYASAB`) to human-readable names (e.g. "Submitted and indexed"). |
| `test/utils.test.js` | 30 unit tests for utility functions (Node.js built-in test runner). |
| `package.json` | ESM module (`"type": "module"`), scripts: `start`, `test`, `reset`. |
| `.gitignore` | Ignores `node_modules`, `cookies.json`, `chrome-profile/`, output files (`index-results*`, `DOM*`). |

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run the extractor |
| `npm test` | Run 30 unit tests |
| `npm run reset` | Clear browser session (to switch Google accounts) |

## How It Works

1. **Launch browser** — System Chrome via Playwright `launchPersistentContext` with anti-detection flags.
2. **Authentication** — Uses persistent `chrome-profile/` directory for session storage. On first run, prompts for email/password via `@clack/prompts` (masked password input). Supports 2-Step Verification (30s timeout). Detects Google sign-in rejection with clear troubleshooting steps.
3. **Discover properties** — If `site` is not set in `credentials.js`, scrapes the GSC welcome page for available properties and presents a multi-select prompt.
4. **Extract Index Coverage** — For each property:
   - Navigates to the Index Coverage page.
   - Extracts available report IDs by scanning all embedded `<script>` tags (future-proof — not tied to specific `ds:N` block numbers).
   - Loops through each report, scraping URLs via CSS selector `.OOHai`.
   - Builds summary stats (extracted count vs. GSC total, extraction ratio).
5. **Extract Sitemap Coverage** (optional, `sitemapExtract = true`):
   - Navigates to Sitemaps page, extracts sitemap list.
   - For each sitemap: extracts coverage summary numbers + individual report URLs.
   - 4-second delay between sitemaps to avoid detection.
6. **Output** — Generates CSV files per property folder + a single Excel workbook (`index-results_DD-MM-YYYY.xlsx`) with tabs per property.

## Configuration (variables in index.js)

| Variable | Default | Description |
|----------|---------|-------------|
| `headless` | `true` | Show browser automation (`false`) or run hidden (`true`). |
| `sitemapExtract` | `true` | Extract sitemap coverage data. |
| `americanDate` | `false` | GSC property uses mm/dd/yyyy date format. |
| `americanDateChange` | `false` | Convert American dates to European format in output. |

CSS selectors (`reportSelector`, `reportTitle`, `reportStatus`) target GSC DOM elements — may break if Google updates the UI.

## Output Structure

```
{property-folder}/
  coverage_{property}_{date}.csv    — All URLs from coverage reports
  summary_{property}_{date}.csv     — Summary stats per report type
  sitemaps-{property}_{date}.csv    — URLs from sitemap coverage reports
  sum-sitemaps-{property}_{date}.csv — Sitemap coverage summary

index-results_{date}.xlsx           — Excel workbook with all data as tabs:
  {property}_SUM      — Coverage summary
  {property}_COV      — Coverage URLs
  {property}_SUM_MAPS — Sitemap summary
  {property}_MAPS     — Sitemap URLs
  Indexed_summary_ALL — Cross-property indexed summary (when >1 property)
```

## Dependencies (4 total)

| Package | Usage |
|---------|-------|
| `playwright` (^1.50) | Browser automation (system Chrome via `launchPersistentContext`) |
| `exceljs` (^4.4) | Excel workbook generation |
| `ansis` (^4.2) | Terminal colors — lightweight chalk replacement with hex() support |
| `@clack/prompts` (^1.0) | Terminal prompts — text, password (masked), multiselect |

## Dev Notes

- **30 unit tests** via `node --test` — covers utils.js functions.
- **No build step, no TypeScript** — ESM JavaScript.
- **CSS selectors are fragile** — GSC UI changes can break scraping.
- **Session persistence** — `chrome-profile/` stores browser state; `npm run reset` clears it.

---

## Telegram Control (telegram-me)

When telegram-me MCP tools are available, this project is controlled via Telegram by default.

**Auto-start autonomous mode:**
1. At the start of every conversation, create the flag file: `touch /tmp/telegram-me-autonomous.flag`
2. Call `get_user_message` to check for buffered Telegram messages
3. Notify user via Telegram: "Autonomous mode active."
4. Enter the autonomous loop

**Autonomous loop:**
1. Wait for Telegram instructions using `ask_user`
2. Execute the instruction (permissions are auto-approved via hook)
3. Report results via `notify_user`
4. **Suggest next steps** (see Smart Suggester below)
5. Loop back to waiting
6. Exit when user sends `/stop` or `/exit`

**Smart Suggester — after completing a task:**
Instead of passively asking "What's next?", proactively analyze the project state and suggest 2-4 concrete next steps. Run these checks silently:

1. **Git status**: uncommitted changes? Untracked files? Suggest committing or cleaning up.
2. **Test health**: run tests silently. Failing tests? Suggest fixing them.
3. **TODOs/FIXMEs**: search for TODO/FIXME comments. Highlight actionable ones.
4. **Recent changes context**: based on the task just completed, suggest natural follow-ups (e.g., "added a feature → write tests", "fixed a bug → check for similar patterns").
5. **Build health**: does the build succeed? TypeScript errors? Suggest fixing them.

Present suggestions via `ask_user` with the `options` parameter so they appear as reply keyboard buttons:
- Question text: "Done! Here's what we could tackle next:"
- Options: `["Fix 2 failing tests", "TODO in file.ts:42", "Commit 3 changed files", "Something else"]`

**IMPORTANT — always include `options`:** Every `ask_user` call MUST include the `options` parameter with 2-4 choices as reply keyboard buttons. This includes the initial "waiting for instructions" prompt, smart suggestions, and any other question. Without `options`, the user loses the convenient keyboard buttons.

Guidelines:
- Keep analysis fast — skip slow checks if the project is large
- Prioritize: failing tests > build errors > uncommitted changes > TODOs
- If nothing actionable is found, ask "What would you like to do next?" with generic options like `["Check project status", "Run tests", "Review recent changes", "Something else"]`
- Don't repeat suggestions the user already declined in this session

**Exiting autonomous mode:**
1. Delete the flag file: `rm -f /tmp/telegram-me-autonomous.flag`
2. Notify user: "Autonomous mode ended."

**Always acknowledge Telegram messages:**
- Every message received must be acknowledged in TWO places:
  1. In the terminal: Output "**Telegram message received:** {message}"
  2. In Telegram: Send a response using `notify_user`
- Check for new messages periodically using `get_user_message`

**Ask before file changes:**
- Before using Edit, Write, or any file-modifying tool, use `ask_user` to confirm
- Format: "About to [action] [file]. Proceed?" with [Yes/No] options

**Planning via Telegram (NEVER use plan mode):**
- NEVER use `EnterPlanMode` or `ExitPlanMode` — they trigger terminal prompts that block autonomous mode
- For tasks requiring planning: explore the codebase, write a plan as text, send via `approve_plan`
- After user approves, implement directly without entering plan mode

**Cross-bot code review (/review):**
When the user sends `/review`, use the `request_review` MCP tool to launch a cross-bot review:
1. Generate a review document: run `git diff` (or `git diff HEAD~1` for the last commit), write it to a temp file with context
2. Call `request_review` with the file path — this launches another bot to review the changes
3. The tool blocks until the reviewer finishes (up to 5 min) and returns the feedback
4. Share the feedback with the user via `notify_user`
If no reviewer bot is available, the tool returns a list of busy bots.

**Telegram commands:**
| Command | Action |
|---------|--------|
| `/stop` or `/exit` | Exit autonomous mode |
| `/status` | Report current activity |
| `/model` | Report current model |
| `/compact` | Remind user to run /compact in terminal |
| `/help` | List available commands |
| `/review` | Launch cross-bot code review (uses `request_review` MCP tool) |
| `/usage` | Usage stats (server-side, zero tokens) |
| `/ping` | Health check (server-side, zero tokens) |
| `/bots` | Show all bot statuses (server-side, zero tokens) |
| `/dash` | Dashboard summary (server-side, zero tokens) |
| `/summon` | Switch to a different project (server-side) |
| `/restart` | Kill and relaunch this session (server-side) |
| `/kill` | Terminate this session (server-side) |

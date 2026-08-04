# RealEstateLeadBot — Bot specification

**Archetype:** crm

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Captures real-estate leads from users, notifies the owner/agent on submission, and provides a private admin interface for managing leads with New/Done status tracking. Data is retained until manually deleted by the owner.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- prospective clients
- real estate owner/agent

## Success criteria

- Leads are captured and stored with all required fields
- Owner receives immediate notifications with lead details and actions
- Owner can filter and manage leads in admin section

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **Submit a lead** (button, actor: user, callback: lead:start) — Initiates lead submission flow
  - inputs: name, phone, intent, note
  - outputs: confirmation message, lead summary
- **/admin** (command, actor: admin, command: /admin) — Opens admin lead list (private to owner)
  - inputs: status filter
  - outputs: paginated lead list
- **View in Admin** (button, actor: admin, callback: admin:view_lead) — Directs to specific lead details in admin interface

## Flows

### Lead submission
_Trigger:_ button:lead:start

1. Display name input prompt
2. Collect phone number (typed or contact share)
3. Show intent selection buttons
4. Request free-text note
5. Display summary with confirmation options
6. Save lead on confirmation

_Data touched:_ Lead

### Admin notifications
_Trigger:_ lead confirmation

1. Send lead details to owner
2. Add quick action buttons (Mark Done, View in Admin)

_Data touched:_ Lead

### Admin management
_Trigger:_ /admin or View in Admin

1. Verify owner identity
2. Show filtered lead list
3. Handle lead status changes
4. Process deletions

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — where new leads and admin notifications are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — User-submitted real estate inquiry
  - fields: id, name, phone, intent, note, status, submitted_at, confirmed_by_user

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure ADMIN_CHAT_ID for notifications
- Mark leads as New/Done
- Delete leads permanently

## Notifications

- Lead submission confirmation to owner
- Status change alerts in admin list

## Permissions & privacy

- Admin access restricted to configured Telegram user ID
- User data stored securely with explicit owner controls

## Edge cases

- Unauthorized users attempting /admin access
- Incomplete lead submissions with invalid phone formats
- Canceling mid-conversation

## Required tests

- End-to-end lead submission flow from capture to owner notification
- Admin access control verification
- Pagination and filtering in admin list
- Data deletion confirmation

## Assumptions

- Owner will provide valid Telegram admin_id post-deployment
- Phone validation only checks for digits and optional '+' prefix

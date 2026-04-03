# Dental / clinic tools API

ElevenLabs-ready HTTP tools backed by **one Google Sheet** (`GOOGLE_SHEET_ID`). Primary use case: a **single implant / cosmetic dental clinic** whose knowledge base lives in that sheet (Company, Services, FAQs, EmergencyRules, etc.).

Legacy plumbing-oriented field names are still accepted where backward compatibility is cheap (e.g. optional `companyId`, gas-policy triage only if `gas_policy_text` is set in the sheet).

## Architecture

### Single-clinic mode (default)

- One spreadsheet per deployment; **you do not need to send `companyId`** on dental flows.
- The backend resolves the clinic from the **first row** in the **Company** tab that has a non-empty `company_id` (that value still keys rows in other tabs).
- You may still pass **`companyId`** on GET query strings or POST bodies for **legacy multi-row sheets**.

Google Sheet tabs:

- Company
- ServiceAreas
- Services
- EmergencyRules
- IntakeFlow
- FAQs
- SMS
- CallLogs
- Appointments (optional — `book_appointment`)
- ServiceContext (optional — generic agent context when implemented end-to-end)

Runtime flow:

1. ElevenLabs agent calls one of your server tools
2. This API reads the relevant Google Sheet tabs using a service account
3. The API returns structured JSON for the agent
4. The agent uses the result to respond, send the right SMS, or escalate
5. At the end of the call the agent calls `log-call`

## Convention: POST tool routes (normalisation standard)

**Default for all new `POST /api/*` routes** that are invoked as **agent tools** (ElevenLabs or similar): use the same pattern as `escalate-human`, `send-sms`, and `log-call`, **unless** there is a strong reason to skip it (document that reason next to the route).

1. **`normalize…Input(raw: unknown)`** in `src/tool-payload-normalize.ts` — trim strings; treat empty strings as absent for optional fields where it helps callers; map legacy / alias field names; generate ids (e.g. `callId`) when omitted.
2. **Canonical Zod schema** (e.g. in `src/logic.ts`) — validate **after** normalisation only.
3. **`parseCanonical(schema, normalized)`** from `src/tool-validation.ts` — throws **`HttpValidationError`** → HTTP **400** with `{ "error": "Validation failed", "fields": { … } }` (handled in `src/lib/route-error.ts` and Express).
4. **Handler** in `src/api-handlers.ts`; the App Router `route.ts` should stay thin (call handler + `jsonError`).

**Exceptions today (intentional):**

| Route | Why |
|--------|-----|
| `POST /api/rules-applicable` | Historical: validates raw body with Zod only; can be migrated to this pattern when touched. |
| `POST /api/escalation-webhook-demo` | Outbound webhook target / demo sink, not an ElevenLabs tool body. |
| `POST /api/debug/*` | Debugging only. |
| `POST /api/crm-sync` | Zod-validated `{ provider, action, payload }` envelope in `handleCrmSync`; HubSpot config gaps return **503** with `missing` keys (not global `config.ts`). |

New POST tools should **not** be added to the exceptions list without a short rationale in code or README.

## Required environment variables

Copy `.env.example` to `.env` and fill in the values (or define the same keys in Vercel for production).

**Core (required)**

- `PORT` — optional on Vercel (platform sets it); used for local `dev:express`
- `X_ELEVENLABS_SECRET_DENTALPRO` (preferred) or legacy `X_ELEVENLABS_SECRET_PLUMBINGPRO` / `X_ELEVENLABS_SECRET`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

**Optional**

- `SHEET_DATA_CACHE_TTL_SECONDS` — if greater than `0`, sheet reads are cached for that many seconds (reduces Google API calls under load).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — required for `POST /api/send-sms` to send real SMS.
- `ESCALATION_WEBHOOK_URL` — JSON POST target for `POST /api/escalate-human`.
- `ESCALATION_WEBHOOK_SECRET` — if set, sent as header `x-escalation-secret` on the webhook request.
- `ESCALATION_TRANSFER_NUMBER` — returned to the agent as a PSTN hint (e.g. on-call mobile).

**Google Calendar (optional — `POST /api/book_appointment`)**

- `GOOGLE_CALENDAR_ID` — Calendar ID to write events into. In Google Calendar: **Settings** (gear) → select the calendar → **Integrate calendar** → copy **Calendar ID** (often an email-like string for a dedicated “Bookings” calendar).
- `GOOGLE_CALENDAR_TIMEZONE` — IANA timezone for timed events (default `Europe/London`), e.g. `America/New_York`.

**Setup (one-time):**

1. In [Google Cloud Console](https://console.cloud.google.com/) for the same project as your Sheets service account, enable the **Google Calendar API**.
2. Create or pick a calendar (recommended: a dedicated “Inbound bookings” calendar).
3. **Share** that calendar with your **service account email** (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) with permission **Make changes to events**.
4. Set `GOOGLE_CALENDAR_ID` in `.env` / Vercel to that calendar’s ID.

If `GOOGLE_CALENDAR_ID` is unset, `book_appointment` still appends to the **Appointments** sheet; the response includes `calendar: { status: "skipped", reason: "calendar_not_configured" }`.

**Event timing:** `preferredDate` must be `YYYY-MM-DD`. `preferredTimeWindow` (after normalisation) is interpreted as: `morning` / `am` → 09:00–12:00, `afternoon` / `pm` → 13:00–17:00, `evening` → 17:00–20:00 (all in `GOOGLE_CALENDAR_TIMEZONE`). Empty, `flexible`, `any`, `all_day`, etc. → an **all-day** event on that date. Invalid dates skip the calendar step with `invalid_preferred_date`.

**HubSpot (optional — only for `POST /api/crm-sync`)**

- `HUBSPOT_ACCESS_TOKEN` — private app token ([private apps overview](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview)).
- `HUBSPOT_DEFAULT_TICKET_PIPELINE`, `HUBSPOT_DEFAULT_TICKET_STAGE_OPEN` — ticket pipeline and open-stage **internal** IDs.
- `HUBSPOT_DEFAULT_TICKET_STAGE_CLOSED` — optional; when request `status` is `closed` (case-insensitive), ticket stage uses this; otherwise open stage.
- `HUBSPOT_CREATE_TASKS` — if truthy (`1`, `true`, `yes`) and `status` is `callback_pending` (case-insensitive), creates a follow-up task.
- `HUBSPOT_CALLBACK_TASK_OWNER_ID` — optional HubSpot owner id for that task.
- `HUBSPOT_ASSOC_TICKET_CONTACT_TYPE_ID`, `HUBSPOT_ASSOC_NOTE_CONTACT_TYPE_ID`, `HUBSPOT_ASSOC_NOTE_TICKET_TYPE_ID`, `HUBSPOT_ASSOC_TASK_CONTACT_TYPE_ID`, `HUBSPOT_ASSOC_TASK_TICKET_TYPE_ID` — optional overrides for Associations API v4 type IDs (defaults match many portals; verify yours — see [HubSpot associations v4 guide](https://developers.hubspot.com/docs/api-reference/crm-associations-v4/guide)).

## Local setup

```bash
npm install
npm run dev
```

This runs **Next.js** (site + `/api/*` on the same origin). The homepage documents endpoints and checks `/api/health`.

Optional: run the original Express server only (no website):

```bash
npm run dev:express
```

## Deploy on Vercel

1. Push the repo to GitHub/GitLab/Bitbucket and import the project in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js** (default). Build: `next build`, output: Next default.
3. In **Project → Settings → Environment Variables**, add every key from [Required environment variables](#required-environment-variables) (and any optional keys you use). Use **Production** (and Preview if you want preview deployments to work against a test sheet).
4. For `GOOGLE_PRIVATE_KEY`, paste the full PEM and replace real newlines with `\n` in the Vercel value field (same as local `.env`).
5. Deploy, then set your ElevenLabs tool URLs to `https://<your-project>.vercel.app/api/...` with header **`x-elevenlabs-secret-dentalpro`** (same string as `X_ELEVENLABS_SECRET_DENTALPRO` in Vercel; legacy env/header names still work). Use a **literal** `https://…vercel.app/...` URL unless ElevenLabs explicitly supports variable interpolation in that field.

Secrets should live in Vercel (or your secret manager), not in the repo. `.env` is gitignored; use `.env.example` as the checklist.

## Smoke test (local)

With a valid `.env`, start the app (`npm run dev`) in one terminal, then:

```bash
npm run smoke
```

Optional: `SMOKE_BASE_URL`, `SMOKE_COMPANY_ID`, `SMOKE_SKIP_LOG_CALL=1`, `SMOKE_SKIP_SEND_SMS=1`, `SMOKE_SMS_TO`, `SMOKE_SMS_TEMPLATE_ID`.

`POST /api/crm-sync` is **not** called by the smoke script (avoids requiring HubSpot in CI). Exercise it manually with the curl example under [POST /api/crm-sync](#post-apicrm-sync).

## Verify ElevenLabs vs this API

1. **Tool creation vs runtime** — ElevenLabs usually **does not** call your server when you save a tool. If tools save but the agent fails, debug **runtime** (URL, headers, secret, sheet access), not “tool creation.”
2. **URL env / variable syntax** — If the tool URL field **does not** substitute secrets or env vars, you may get a bad host or 404. Use a **literal** `https://<project>.vercel.app/api/...` until you confirm their interpolation rules.
3. **Literal Vercel URL** — From a terminal:  
   `curl -sS -i -H "x-elevenlabs-secret-dentalpro: <SECRET>" "https://<project>.vercel.app/api/company-context"`  
   Expect **200** + JSON if Google credentials and sheet access are correct; **401** if the header or secret is wrong.
4. **What the backend checks** — Header **`x-elevenlabs-secret-dentalpro`** (or legacy **`x-elevenlabs-secret-plumbingpro`**) must equal **`X_ELEVENLABS_SECRET_DENTALPRO`** (or legacy **`X_ELEVENLABS_SECRET_PLUMBINGPRO`** / **`X_ELEVENLABS_SECRET`**).
5. **401 response** — Wrong/missing header or wrong secret → **401** with JSON: `error`, `reason: "missing_or_invalid_secret_header"`, `header` (canonical `x-elevenlabs-secret-dentalpro`), and `legacyHeaderAlsoAccepted` (`x-elevenlabs-secret-plumbingpro`).

### Temporary auth debugging

Set **`DEBUG_AUTH=1`** (Vercel env + redeploy). Then:

- Failed auth responses include a **`debug`** object: `hasHeader`, `hasEnv`, `headerLength`, `envLength`, `matches`, `expectedEnvKey`, `primaryHeader`, `legacyHeaderAlsoAccepted`, `looksLikeUnresolvedPlaceholder` (true if the incoming value still looks like an unresolved ElevenLabs `{{secret:…}}` placeholder).
- Function logs include a JSON line `[auth-debug:next] …` (no secret values).
- **`GET /api/debug/auth-debug`** returns the same diagnostic shape for the incoming request (404 when the flag is off).

Remove the flag when finished.

**Manual check with real secret** (replace `YOUR_SECRET`):

```bash
curl -i "https://<your-project>.vercel.app/api/company-context" \
  -H "x-elevenlabs-secret-dentalpro: YOUR_SECRET"
```

## Endpoints

### Agent-facing payloads (normalisation layer)

The routes below follow the project **[POST tool route convention](#convention-post-tool-routes-normalisation-standard)**:

- **`POST /api/escalate-human`**, **`POST /api/send-sms`**, **`POST /api/log-call`**, **`POST /api/book_appointment`**

Behaviour:

- Trims all strings and treats **empty strings as missing** for optional fields (where each normaliser defines).
- **Generates `callId`** if missing or blank: `call_<timestamp>_<random>` (on those routes).
- Accepts **legacy field names** during transition (e.g. `callerPhone` or `phone`, `to` or `phone`, `templateId` or `messageType`).
- Validates with **Zod after** normalisation. On failure, returns **`400`** with:

```json
{ "error": "Validation failed", "fields": { "address": "Required for emergency escalation" } }
```

**`GET`** tools are unchanged. **`POST /api/rules-applicable`** is not yet on the shared normaliser (see exceptions table above).

### `GET /api/company-context`

Use when the agent needs approved clinic facts from the **Company** tab.

Query params:

- `companyId` — optional; if omitted, the first Company row is used (single-clinic mode).

Returns:

- identity, phone, hours, service area, booking link, payment methods
- estimate / consultation-related wording (`estimatePolicy`, `consultationFeeWording`, etc.)
- optional dental-oriented fields when columns exist: `depositPolicyWording`, `cancellationPolicyWording`, `financeWording`, `guaranteeAftercareWording`, `medicalEmergencyPolicyWording`
- `gasPolicy`, `safetyDisclaimer` (gas triage in rules only applies if `gas_policy_text` is non-empty)

### `GET /api/services-search`

Use when the caller asks about treatments; searches **Services** (`service_name`, `category`, `common_customer_words`, `what_it_means`).

Query params:

- `companyId` — optional (single-clinic default as above)
- `query` — search text (required for useful matches; may be empty)

Response includes **`results`** (matches with optional `indicativePriceGuidance`, `procedureSummary`, `timeline`, `encourageConsultation` when those columns exist) and **`clinicPolicies`** (booking link, consultation/deposit/cancellation/finance wording, etc. from Company).

### `POST /api/rules-applicable`

Main **EmergencyRules** triage tool (dental urgent scenarios + legacy plumbing flags). **`companyId` optional** — defaults to the first Company row.

Body example:

```json
{
  "issueSummary": "Severe pain and swelling two days after implant placement",
  "postcode": "N19 3AB",
  "waterActive": true,
  "electricsRisk": false,
  "sewageRisk": false,
  "onlyToiletUnusable": false,
  "noWater": false,
  "vulnerablePerson": false
}
```

Returns:

- matched services
- priority
- emergency flag
- whether to transfer now
- immediate instruction
- recommended action
- service area result
- SMS template
- relevant approved FAQs

### `GET /api/intake-flow`

Returns ordered intake steps from the `IntakeFlow` tab for sheet-driven questioning.

Query params:

- `companyId` optional
- `askWhen` optional — when set, keeps rows where `ask_when` is empty, `always`, `all`, or matches (case-insensitive substring).

### `POST /api/send-sms`

Sends an SMS using Twilio. Returns `503` if Twilio env vars are not set.

**Preferred agent fields:** `callId` (optional — auto-generated if blank), `phone`, `messageType`, `name`, `bookingLink`, `issueSummary`, optional `postcode`. **`companyId` optional** (single-clinic default from sheet).  
**Legacy:** `to` instead of `phone`, `templateId` instead of `messageType` (both still supported).

**`messageType` → sheet `templateId` mapping:**

| messageType | templateId |
|-------------|------------|
| `emergency_confirmation` | SMS01 |
| `callback_confirmation` | SMS02 |
| `booking_link` | SMS03 |
| `redirect_notice` | SMS04 |

If **`messageText`** is set, it is used as the message body (with the same `{{name}}`, `{{issueSummary}}`, etc. placeholders). Otherwise the body is built from the **`SMS`** tab template for `templateId`. **`bookingLink`** in the request overrides the company default from the sheet when substituting `{{bookingLink}}`.

**Required after normalisation:** `callId`, `to`, `templateId` (`companyId` filled from sheet if omitted).

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "phone": "+447700900123",
  "messageType": "emergency_confirmation",
  "name": "Jordan Yussuf",
  "bookingLink": "https://www.example.com/book",
  "issueSummary": "Burst pipe with water near electrics"
}
```

```bash
curl -sS -X POST "$BASE/api/send-sms" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-dentalpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","phone":"+447700900123","messageType":"emergency_confirmation","name":"Jordan","issueSummary":"Test"}'
```

Template text may use placeholders: `{{name}}`, `{{issueSummary}}`, `{{issue}}`, `{{postcode}}`, `{{callId}}`, `{{companyName}}`, `{{bookingLink}}`.

### `POST /api/escalate-human`

Notifies an on-call system via webhook and/or returns a transfer number. Returns `503` if neither `ESCALATION_WEBHOOK_URL` nor `ESCALATION_TRANSFER_NUMBER` is configured.

**Preferred agent fields:** `callId` (optional — auto-generated if blank), `name`, `phone`, `postcode`, **`address`** (required), `issueSummary`, `priority`, `reason`. **`companyId` optional** (single-clinic default).  
**Legacy:** `callerPhone` instead of `phone`.

**Required after normalisation:** `callId`, `name`, `callerPhone` (from `phone` or `callerPhone`), `issueSummary`, `priority`, `reason`, **`address`** (`companyId` filled from sheet if omitted).

The webhook payload includes **`postcode`** and **`address`** when set.

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "name": "Jordan Yussuf",
  "phone": "07476811532",
  "postcode": "N19 3NB",
  "address": "89 Hazelville Road, Islington",
  "issueSummary": "Active flooding with sewage and electrics at risk",
  "priority": "P1",
  "reason": "Flooding with sewage and vulnerable people present"
}
```

```bash
curl -sS -X POST "$BASE/api/escalate-human" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-dentalpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","name":"Jordan","phone":"+447700900123","address":"1 Test St","issueSummary":"Leak","priority":"P1","reason":"Emergency"}'
```

Response includes `webhookDelivered`, `webhookStatus` (when a webhook URL is set), `webhookResponsePreview` (first ~600 chars of the webhook response body when `webhookDelivered` is false — use this to debug 4xx/5xx from `ESCALATION_WEBHOOK_URL`), and `transferNumber`.

### Demo escalation webhook (same deployment)

Point **`ESCALATION_WEBHOOK_URL`** at this URL to log payloads into a new **`Escalations`** sheet tab (created automatically):

```text
ESCALATION_WEBHOOK_URL=https://<your-project>.vercel.app/api/escalation-webhook-demo
```

(Use your real Vercel hostname if different.)

- **`POST /api/escalation-webhook-demo`** — JSON body: `companyId`, `callId` (required); `name`, `callerPhone`, `postcode`, `address`, `issueSummary`, `priority`, `reason` (optional strings, default empty). Compatible with the JSON sent by `postEscalationWebhook` (`timestamp` allowed, ignored for the row; `receivedAt` is set server-side). If **`ESCALATION_WEBHOOK_SECRET`** is set, requests must include header **`x-escalation-secret`** with the same value (same as real `escalate-human` → webhook).
- **`GET /api/escalation-webhook-demo`** — Returns `{ ok, count, escalations }` with the newest rows first (up to 50). Unauthenticated for quick visual checks (keep URL obscure in production or remove later).

**If `escalate-human` shows `webhookStatus: 500` (not 404):** the demo URL was reached but failed inside the handler (usually Google Sheets). Check `webhookResponsePreview` for JSON `message`. The API auto-writes row 1 headers when column A is not `receivedAt` but **there is no real data in rows 2+** (e.g. wrong labels in row 1 only). If you still see an error, clear non-empty cells in row 1 or delete data rows below a bad header. **`webhookStatus: 404`** means the URL path is wrong or the deployment has no such route.

### `POST /api/log-call`

Appends a row into the `CallLogs` sheet.

**Preferred agent fields:** `callId` (optional — auto-generated if blank), `intent`, `priority`, `emergencyFlag`, `name`, `phone`, `postcode`, `issueSummary`, `actionTaken`, `smsSent`, `escalatedTo`, `status`. **`companyId` optional** (single-clinic default).  
**Legacy:** `callerPhone` is accepted and mapped to `phone`.

**Required after normalisation:** `callId`, `issueSummary`, `actionTaken`, `status` (`companyId` filled from sheet if omitted). Other fields have defaults where noted below.

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "intent": "plumbing_emergency",
  "priority": "P1",
  "emergencyFlag": "Yes",
  "name": "Jordan Yussuf",
  "phone": "07476811532",
  "postcode": "N19 3NB",
  "issueSummary": "Burst pipe with water near electrics",
  "actionTaken": "Urgent callback arranged",
  "smsSent": "SMS01",
  "escalatedTo": "On call engineer",
  "status": "callback_pending"
}
```

```bash
curl -sS -X POST "$BASE/api/log-call" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-dentalpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","issueSummary":"Test issue","actionTaken":"none","status":"closed"}'
```

### `POST /api/book_appointment`

Generic service-business appointment capture: appends a row to the **Appointments** sheet (tab created automatically with headers when possible). If Google Calendar is configured and `preferredDate` is valid, also inserts an event.

**Normalisation:** trims strings; empty optionals become defaults; `callId` auto-generated if blank; aliases: `appointmentDate` → `preferredDate`, `timeWindow` → `preferredTimeWindow`, `callerPhone` → `phone`, `appointmentType` → `serviceType`.

**Required after normalisation:** `callId`, `phone` (min length 5) (`companyId` filled from sheet if omitted). Other fields default to empty strings except `source` → `voice_agent`.

**Response:** `{ ok, callId, calendar }` where `calendar` is either `{ status: "created", eventId, htmlLink }`, `{ status: "skipped", reason }`, or `{ status: "error", message }` (sheet row is still saved if the error happens only on the calendar step).

```json
{
  "companyId": "rapidflow_london",
  "callId": "",
  "name": "Jordan Yussuf",
  "phone": "+447700900123",
  "email": "jordan@example.com",
  "postcode": "N19 3NB",
  "serviceCategory": "consulting",
  "serviceType": "initial_consultation",
  "preferredDate": "2026-03-30",
  "preferredTimeWindow": "morning",
  "notes": "Parking at rear",
  "source": "voice_agent"
}
```

```bash
curl -sS -X POST "$BASE/api/book_appointment" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-dentalpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","phone":"+447700900123","preferredDate":"2026-04-15","preferredTimeWindow":"afternoon","notes":"Test booking"}'
```

### `POST /api/crm-sync`

Syncs an emergency-call-shaped payload to **HubSpot** (contact upsert, ticket, note, optional callback task). Same auth as other agent tools: header **`x-elevenlabs-secret-dentalpro`**.

This does **not** replace Google Sheets or change `POST /api/log-call`. Call it from a workflow, server job, or secondary tool **after** (or alongside) `log-call` if you want CRM records.

**Body (Zod-validated envelope):**

```json
{
  "provider": "hubspot",
  "action": "emergency_call",
  "payload": {
    "companyId": "rapidflow_london",
    "callId": "call_123",
    "name": "Jordan Yussuf",
    "phone": "+447700900123",
    "address": "89 Hazelville Road",
    "postcode": "N19 3NB",
    "issueSummary": "Burst pipe with water near electrics",
    "priority": "P1",
    "emergencyFlag": "Yes",
    "actionTaken": "Urgent callback arranged",
    "smsSent": "SMS01",
    "escalatedTo": "On call engineer",
    "status": "callback_pending"
  }
}
```

- `callId` optional; if omitted or blank, server generates one (`call_<timestamp>_<random>`), same spirit as other POST tools.
- Strings are trimmed; empty optional fields are treated as absent.

**Responses**

- **200** — `{ "ok": true, "contactId", "ticketId", "noteId", "taskId" }` where `taskId` is `null` unless tasks are enabled and `status` is `callback_pending`.
- **400** — validation (`ZodError` → `error`, `fields`).
- **503** — HubSpot not configured: `{ "error": "HubSpot not configured", "missing": ["HUBSPOT_ACCESS_TOKEN", ...] }`.

**HubSpot private app setup**

1. In HubSpot: **Settings → Integrations → Private Apps** → create an app, copy the access token to `HUBSPOT_ACCESS_TOKEN`.
2. Grant **minimal scopes** (enable read **and** write where both exist). Typical set:

   | Scope (pattern) | Use |
   |-----------------|-----|
   | `crm.objects.contacts.read` / `crm.objects.contacts.write` | Search, create, update contacts |
   | `crm.objects.tickets.read` / `crm.objects.tickets.write` | Create tickets, set pipeline/stage |
   | `crm.objects.notes.read` / `crm.objects.notes.write` | Create notes |
   | `crm.objects.tasks.read` / `crm.objects.tasks.write` | Optional callback tasks |

   Exact labels vary slightly in the HubSpot UI; search the scope picker for `contacts`, `tickets`, `notes`, `tasks`. If association calls return **403**, add any **association**-related scopes the portal offers for CRM objects.

3. **Pipeline and stage IDs**: **Settings → Data Management → Objects → Tickets → Pipelines** — open a pipeline; internal IDs appear in the URL or pipeline/stage detail (use numeric **internal** IDs, not display names).

**Association type IDs**

Default env fallbacks (many default HubSpot portals): ticket→contact `16`, note→contact `190`, note→ticket `228`, task→contact `204`, task→ticket `216`. If associations fail, confirm types for your portal (HubSpot docs / **Settings → Data Management → Associations**) and set the `HUBSPOT_ASSOC_*_TYPE_ID` variables in `.env.example`.

**Field mapping**

| Source (payload / behaviour) | HubSpot |
|-----------------------------|---------|
| `name` | Contact `firstname` / `lastname` (first token / remainder) |
| `phone` | Contact `phone`; used for search upsert when present |
| `address` | Contact `address` |
| `postcode` | Contact `zip` |
| No `phone` | Contact created without search (duplicates possible) |
| `issueSummary` + `callId` | Ticket `subject` (summary truncated + `[callId]`) |
| Env pipeline / stage + `status` | Ticket `hs_pipeline`, `hs_pipeline_stage` (`closed` + `HUBSPOT_DEFAULT_TICKET_STAGE_CLOSED` when set) |
| `priority` | Ticket `hs_ticket_priority`: P1/P2 → HIGH, P3 → MEDIUM, P4/Redirect → LOW |
| Full payload (structured lines) | Note `hs_note_body`; `hs_timestamp` = server ms |
| `status` + `HUBSPOT_CREATE_TASKS` | Task when `status` is `callback_pending`: subject `Callback: {callId}`, body with name/phone/issue; due +24h; optional `hubspot_owner_id` |

**curl**

```bash
curl -sS -X POST "$BASE/api/crm-sync" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-dentalpro: $SECRET" \
  -d '{
    "provider":"hubspot",
    "action":"emergency_call",
    "payload":{
      "companyId":"rapidflow_london",
      "issueSummary":"Test CRM sync",
      "name":"Test User",
      "phone":"+447700900123",
      "actionTaken":"none",
      "status":"closed"
    }
  }'
```

Failures mid-flow are **not** rolled back; fix data in HubSpot manually if needed.

## ElevenLabs tool mapping

Create these server tools:

### 1. Company context
- Method: `GET`
- URL: `https://your-domain.com/api/company-context` (optional `?companyId=` for legacy sheets)
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Use: approved facts only

### 2. Service search
- Method: `GET`
- URL: `https://your-domain.com/api/services-search?query={{issue_summary}}` (optional `companyId`)
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Use: likely service matching

### 3. Rules applicable
- Method: `POST`
- URL: `https://your-domain.com/api/rules-applicable`
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: main emergency triage

### 4. Log call
- Method: `POST`
- URL: `https://your-domain.com/api/log-call`
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: end of call logging
- Body: prefer `phone`, `issueSummary`, `actionTaken`, `status` (see [POST /api/log-call](#post-apilog-call)); `callId` optional; `companyId` optional (single-clinic default)

### 5. Intake flow
- Method: `GET`
- URL: `https://your-domain.com/api/intake-flow` (optional `companyId`, `askWhen`)
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Use: structured questions from the sheet

### 6. Send SMS
- Method: `POST`
- URL: `https://your-domain.com/api/send-sms`
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: send the approved template after triage
- Body: prefer `phone`, `messageType` (or legacy `to` / `templateId`); see [POST /api/send-sms](#post-apisend-sms)

### 7. Escalate human
- Method: `POST`
- URL: `https://your-domain.com/api/escalate-human`
- Header: `x-elevenlabs-secret-dentalpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: webhook + optional transfer number for genuine emergencies
- Body: prefer `phone`, **`address`** (required), `postcode`; see [POST /api/escalate-human](#post-apiescalate-human)

## Recommended prompt rule

Use `rules-applicable` whenever the caller describes a plumbing issue, an emergency, a leak, blocked drain, no water, no hot water, or any safety concern. Do not guess urgency, coverage, or safety instructions if the tool can provide them.

Use `company-context` for hours, coverage summary, payment methods, pricing policy, warranty policy, gas leak redirects, and booking link details.

Use `services-search` when the customer issue is vague and you need likely service categories.

Always use `log-call` before ending a real customer call.

Use `intake-flow` when you want the sheet to drive which questions to ask and in what order.

Use `send-sms` after you know which `smsTemplateId` applies (often from `rules-applicable`).

Use `escalate-human` when `transferNow` is true or the caller needs an immediate human handoff.

## Possible next additions

- `GET /api/check-service-area` — thin wrapper if you want a dedicated postcode-only tool (coverage is already included in `rules-applicable`).

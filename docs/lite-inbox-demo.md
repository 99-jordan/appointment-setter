# Lite Inbox — Demo MVP Spec

**Product:** Ring A Ring (`ringaringa.ai`)  
**Goal:** Clinic staff log in and see real AI-handled calls — enough to trust the system in a sales or pilot demo.  
**Not in scope (demo):** Full SaaS signup, billing, multi-clinic admin UI, transcripts.

This document ties the **inbox product** to the **live backend in this repo** (`dental-tools-api` / appointment setter) and the **separate app repo** that hosts `app.ringaringa.ai`.

**v0 data source:** The active Google Sheet (`GOOGLE_SHEET_ID`) → **`CallLogs`** tab.  
**Next move:** Supabase + RLS when you need multi-clinic SaaS on one platform (see [Next move: Supabase](#next-move-supabase)).

---

## Repository split (where to build what)

| Repo | Vercel / domain | Owns |
|------|-----------------|------|
| **This repo** (`appointment setter`) | `api.ringaringa.ai` or `*.vercel.app` for this project | ElevenLabs **tool APIs**, **read/write CallLogs** on the active sheet, Twilio, HubSpot, **`GET /api/inbox/calls`** (to add) |
| **App repo** (`app.ringaringa.ai`) | `app.ringaringa.ai` | **Inbox UI** (`/inbox/*`), **clinic login** (demo: portal password or session), **fetch calls from this repo’s inbox API** |

ElevenLabs only talks to **this repo**. The app repo never uses `x-elevenlabs-secret-dentalpro`.

---

## System diagram (v0 — Sheets)

```text
┌─────────────────┐     x-elevenlabs-secret-dentalpro      ┌──────────────────────────────┐
│  ElevenLabs     │ ─────────────────────────────────────► │  THIS REPO (API)             │
│  voice agent    │     POST /api/log-call                 │  handleLogCall → append      │
└─────────────────┘     POST /api/send-sms, book, etc.     └──────────────┬───────────────┘
                                                                            │
                                                                            ▼
                                                                  Google Sheet (GOOGLE_SHEET_ID)
                                                                  Tab: CallLogs!A:N
                                                                            ▲
                                                                            │ readCallLogs()
                                                                            │ GET /api/inbox/calls
                                                                            │
┌─────────────────┐     clinic session / portal secret     ┌────────┴─────────┐
│  Clinic staff   │ ◄──────────────────────────────────────│  APP REPO      │
│  browser        │     server-side or BFF fetch           │  app.ringaringa│
└─────────────────┘                                        │  /inbox/*      │
                                                             └────────────────┘
```

HubSpot (`/api/hubspot/upsert-contact`) runs in parallel; not shown in inbox v0.

---

## Demo goal (one sentence)

A clinic owner opens **`https://app.ringaringa.ai/inbox`**, signs in, and sees **real calls** from the **`CallLogs`** tab on the sheet already wired to this API (`GOOGLE_SHEET_ID`).

---

## This repo — ElevenLabs connectors (live today)

All agent tools use header **`x-elevenlabs-secret-dentalpro`** (env: `X_ELEVENLABS_SECRET_DENTALPRO`).  
Legacy header `x-elevenlabs-secret-plumbingpro` still accepted.  
See `src/elevenlabs-secret-header.ts`, `src/lib/elevenlabs-secret.js`.

Point ElevenLabs tool URLs at **this repo’s deployment**, e.g.  
`https://<api-host>/api/...`.

### Tool routes relevant to the inbox

| Inbox relevance | Method | Path | Handler | Route file |
|-----------------|--------|------|---------|------------|
| **Primary feed (write)** | POST | `/api/log-call` | `handleLogCall` | `src/app/api/log-call/route.ts` |
| **Primary feed (read)** | GET | `/api/inbox/calls` | *to implement* | `src/app/api/inbox/calls/route.ts` |
| Enriches `sms_sent` on log | POST | `/api/send-sms` | `handleSendSms` | `src/app/api/send-sms/route.ts` |
| Booking (Appointments tab) | POST | `/api/book_appointment` | `handleBookAppointment` | `src/app/api/book_appointment/route.ts` |
| CRM (not inbox v0) | POST | `/api/hubspot/upsert-contact` | | `src/app/api/hubspot/upsert-contact/route.ts` |
| Health (public) | GET | `/api/health` | | `src/app/api/health/route.ts` |
| Health (protected scan) | GET | `/api/health-scan` | `runProtectedHealthScan` | `src/app/api/health-scan/route.ts` |

**Agent rule for demo:** End every call with **`log-call`**. Reuse the same **`callId`** across tools when possible.

---

## This repo — `POST /api/log-call` (write — live)

**Auth:** `requireElevenSecret` → 401 if header missing/wrong.

**Pipeline:** `normalizeLogCallInput` → `mergeDefaultCompanyId` → `logCallCanonicalSchema` → `appendCallLog` → `{ ok: true, callId }`.

**Code:** `src/tool-payload-normalize.ts`, `src/logic.ts`, `src/api-handlers.ts`, `src/googleSheets.ts`.

### Request body (camelCase)

| Field | Required | Notes |
|-------|----------|--------|
| `issueSummary` | Yes | Main “what they wanted” |
| `actionTaken` | Yes | What the agent did |
| `status` | Yes | e.g. `closed`, `booked`, `callback_pending` |
| `callId` | No | Auto-generated `call_${timestamp}_${hex}` if omitted |
| `companyId` | No | Defaults via `getDefaultCompanyId` / `SINGLE_CLINIC_COMPANY_ID` (`default`) |
| `name`, `phone` | No | `phone` alias: `callerPhone` |
| `postcode`, `intent`, `priority`, `emergencyFlag`, `smsSent`, `escalatedTo` | No | See `normalizeLogCallInput` |

### Google Sheet — `CallLogs` (live write)

- Spreadsheet: **`GOOGLE_SHEET_ID`** (same sheet as Company, Services, SMS, etc.)
- Tab: **`CallLogs`**, append range **`CallLogs!A:N`**
- Column order (positional; matches `CallLogRow` in `src/types.ts`):

```text
A  timestamp          (ISO UTC at write)
B  company_id
C  call_id
D  intent
E  priority
F  emergency_flag
G  name
H  phone
I  postcode
J  issue_summary
K  action_taken
L  sms_sent
M  escalated_to
N  status
```

- Timezone for display in inbox UI: **`Europe/London`** (same default as calendar tools in `config.googleCalendarTimezone`).

---

## This repo — inbox read API (to implement)

**Purpose:** App repo loads calls without Google credentials in the browser. Server reads the **active** sheet via existing service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`).

### Suggested route

**`GET /api/inbox/calls`**

| Query | Purpose |
|-------|---------|
| `limit` | Default `50`, max e.g. `100` |
| `companyId` | Optional filter on column B (single-clinic demo: omit, or pass sheet default) |

**`GET /api/inbox/calls/[callId]`** (optional for v0; can filter client-side by `call_id`)

### Auth (clinic — not ElevenLabs)

Use a **separate** secret from agent tools, e.g. header **`x-clinic-portal-secret`** paired with env **`CLINIC_PORTAL_SECRET`** on this repo.

- App repo stores `CLINIC_PORTAL_SECRET` server-side only (Route Handler / server action fetches inbox API).
- Never expose `X_ELEVENLABS_SECRET_DENTALPRO` to the app or browser.

### Implementation sketch (this repo)

1. **`readCallLogs()`** in `src/googleSheets.ts` — `readTab('CallLogs')`, map rows to `CallLogRow[]` (fixed column indices or row-1 headers if present).
2. **`handleInboxCallsList()`** in `src/api-handlers.ts` — sort by `timestamp` desc, apply `limit` / optional `companyId` filter via `matchesCompanyRow` from `src/clinic-default.ts`.
3. **Thin route** `src/app/api/inbox/calls/route.ts` — `requireClinicPortalSecret`, return JSON:

```json
{
  "ok": true,
  "calls": [
    {
      "timestamp": "2026-06-16T10:27:00.000Z",
      "companyId": "default",
      "callId": "call_…",
      "intent": "dental_enquiry",
      "priority": "P3",
      "emergencyFlag": "No",
      "name": "Jordan Yussuf",
      "phone": "07476811532",
      "postcode": "",
      "issueSummary": "…",
      "actionTaken": "…",
      "smsSent": "",
      "escalatedTo": "",
      "status": "closed"
    }
  ]
}
```

Use **camelCase** in JSON for the app repo; map from sheet/snake internally.

---

## App repo — inbox UI (build there)

### Screens

| Route | Purpose |
|-------|---------|
| `/inbox/login` | Demo login (shared portal password or magic link later) |
| `/inbox` | Call list (newest first) |
| `/inbox/calls/[callId]` | Detail |

### List columns → API / sheet fields

| UI column | Source field |
|-----------|----------------|
| When | `timestamp` → display Europe/London |
| Caller | `name` or “Unknown” |
| Phone | `phone` |
| Summary | `issueSummary` (~60 chars) |
| Outcome | `status` |

### Detail sections

- **Caller:** `name`, `phone`, `postcode`
- **What they wanted:** `issueSummary`
- **What the agent did:** `actionTaken`, `status`, `smsSent`, `escalatedTo`
- **Meta:** `callId`, `timestamp`, `intent`, `priority`, `emergencyFlag`

### App repo env (v0)

```text
INBOX_API_BASE=https://api.ringaringa.ai   # or this repo’s vercel.app URL
CLINIC_PORTAL_SECRET=…                     # server-only; matches this repo
NEXT_PUBLIC_APP_URL=https://app.ringaringa.ai
```

Fetch pattern: **app server route** → `GET ${INBOX_API_BASE}/api/inbox/calls` with `x-clinic-portal-secret`.

---

## This repo — related tools (same call flow)

### `POST /api/send-sms`

Direct mode: JSON with **`body`** + **`to`**/`phone`. Legacy: sheet SMS templates. Set **`smsSent`** on **`log-call`**.

### `POST /api/book_appointment`

Calendar + optional **Appointments** tab. Pass shared **`callId`** when you join bookings in a later inbox version.

### `POST /api/hubspot/upsert-contact`

CRM sync; not in inbox v0.

---

## Why Sheets first (v0)

| Reason | Detail |
|--------|--------|
| **Already live** | `log-call` writes `CallLogs` today |
| **No new infra** | Same `GOOGLE_SHEET_ID` and service account |
| **Fast demo** | One read API + app UI |
| **Good for one clinic / one sheet** | Matches current deployment model |

**Limitation:** Multi-clinic SaaS on one app URL needs tenant-safe storage later → [Next move: Supabase](#next-move-supabase).

---

## Environment variables by repo (v0)

### This repo (API)

**Already in use**

- `X_ELEVENLABS_SECRET_DENTALPRO`
- `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- Optional: `GOOGLE_CALENDAR_*`, `TWILIO_*`, `HUBSPOT_*`, `SHEET_DATA_CACHE_TTL_SECONDS`

**Add for inbox read**

- `CLINIC_PORTAL_SECRET` — protects `GET /api/inbox/calls` (clinic-facing, not ElevenLabs)

### App repo

- `INBOX_API_BASE` — this repo’s public URL
- `CLINIC_PORTAL_SECRET` — server-only, same value as API repo
- `NEXT_PUBLIC_APP_URL`
- Demo login: `CLINIC_PORTAL_PASSWORD` or similar (app-only, optional if login is only “know the password”)

**No Supabase env vars in v0.**

---

## Domain & deployment

| Host | Repo | Role |
|------|------|------|
| `www.ringaringa.ai` | Marketing (optional) | Public site |
| `app.ringaringa.ai` | **App repo** | Inbox UI |
| `api.ringaringa.ai` or `*.vercel.app` | **This repo** | `/api/log-call`, **`/api/inbox/calls`**, other tools |

ElevenLabs → **API host**. App inbox → **API host** `/api/inbox/calls` (server-side).

### DNS: `app.ringaringa.ai`

1. DNS: **CNAME** `app` → Vercel target from app project.
2. Vercel app project → add domain.
3. Until live: use preview URLs for both projects.

---

## Build order (v0 — Sheets)

### Phase A — This repo

1. [ ] `readCallLogs()` in `src/googleSheets.ts`
2. [ ] `handleInboxCallsList()` (+ optional by `callId`) in `src/api-handlers.ts`
3. [ ] `requireClinicPortalSecret` (mirror pattern of `requireElevenSecret`)
4. [ ] `GET /api/inbox/calls` route
5. [ ] Test: after `POST /api/log-call`, GET returns the new row

### Phase B — App repo

1. [ ] Login (demo password → session cookie)
2. [ ] Server fetch to `INBOX_API_BASE/api/inbox/calls`
3. [ ] `/inbox`, `/inbox/calls/[callId]`
4. [ ] Deploy `app.ringaringa.ai`

### Phase C — Demo polish

1. [ ] 3–5 test calls via agent or direct `log-call`
2. [ ] Agent prompt: always end with `log-call`
3. [ ] Optional: open raw **CallLogs** tab as backup demo

**Rough effort:** ~2–4 days across both repos (no Supabase).

---

## Agent / demo checklist

| Requirement | Why |
|-------------|-----|
| Every call ends with **`POST /api/log-call`** | Rows in `CallLogs` |
| **`issueSummary`**, **`actionTaken`**, **`status`** filled | Inbox detail credible |
| **`name`** / **`phone`** when known | List credible |
| **`smsSent`** if SMS ran | Detail shows SMS |
| Active sheet has **CallLogs** tab | Read API has data |

**5-minute demo**

1. Open `app.…/inbox`.  
2. Live call → agent runs tools → **`log-call`**.  
3. Refresh inbox → row from sheet via API.  
4. Open detail.  
5. Optional: show same row in Google Sheets for sceptics.

---

## Feature checklist (v0)

### Must have

- [ ] `readCallLogs` + **`GET /api/inbox/calls`** (this repo)
- [ ] **`CLINIC_PORTAL_SECRET`** auth on inbox routes
- [ ] App repo: login, list, detail
- [ ] ElevenLabs → **`POST /api/log-call`**
- [ ] Mobile-readable layout

### Not for v0

- Supabase, dual-write, RLS  
- Signup funnel, billing, multi-org  
- Transcripts, HubSpot in inbox  
- Direct Google Sheet access from browser  

---

## Current gaps in this repo

| Item | Status |
|------|--------|
| `appendCallLog` → CallLogs | **Live** |
| `readCallLogs` / `GET /api/inbox/calls` | **Not implemented** |
| `CLINIC_PORTAL_SECRET` auth | **Not implemented** |
| Inbox UI | **App repo** |
| Supabase | **Deferred** — see below |

---

## Next move: Supabase

When you onboard **many clinics on one `app.ringaringa.ai`** and need proper isolation (not one shared sheet + portal secret):

1. **Supabase:** `organizations`, `organization_members`, `calls`, **RLS**
2. **This repo:** dual-write in `handleLogCall` (sheet + Supabase insert)
3. **App repo:** Supabase Auth (magic link), read `calls` with user session — stop using `GET /api/inbox/calls` for production reads
4. **Per-org API keys** for ElevenLabs → map to `organization_id`

Sheets can remain **backup / config** (Company, Services, SMS tabs). Inbox production reads move to Postgres.

Rough schema when you get there:

```text
organizations (id, name, sheet_company_id)
organization_members (user_id, organization_id, role)
calls (organization_id, call_id, occurred_at, …same fields as CallLogRow…)
```

No Supabase work required for the **Sheets-first demo**.

---

## Bottom line (v0)

- **Write:** `log-call` → **`CallLogs`** on **`GOOGLE_SHEET_ID`** (already live).  
- **Read:** add **`GET /api/inbox/calls`** on **this repo** (service account reads active sheet).  
- **UI:** **app repo** fetches inbox API with **`CLINIC_PORTAL_SECRET`**, not ElevenLabs secret.  
- **Supabase:** explicit **next move** when SaaS multi-tenancy matters — not blocking the demo.

# Ring A Ring — Clinic Inbox Portal

Standalone Next.js app for **`app.ringaringa.ai`**.  
Clinic staff log in here and see calls logged by the AI receptionist.

**This folder is the UI only.** It does not talk to Google Sheets directly. It calls the **API repo** (`appointment setter` / dental-tools-api), which reads the active sheet’s **CallLogs** tab.

---

## Two-repo layout

| Piece | Repo / host | Role |
|-------|-------------|------|
| **API backend** | `appointment setter` → `api.ringaringa.ai` or `*.vercel.app` | ElevenLabs tools, writes + reads **CallLogs** |
| **Inbox portal (this folder)** | New Next app → `app.ringaringa.ai` | Login + call list + detail |

```text
ElevenLabs ──POST /api/log-call──► API repo ──► Google Sheet (CallLogs tab)
                                      ▲
                                      │ GET /api/inbox/calls
                                      │ Header: x-clinic-portal-secret
Inbox portal (this app) ──────────────┘
  /inbox/login → /inbox → /inbox/calls/[callId]
```

---

## What the API repo already has (do not rebuild)

These exist in **`appointment setter`** today:

| Item | Location |
|------|----------|
| Write calls | `POST /api/log-call` → `CallLogs!A:N` on `GOOGLE_SHEET_ID` |
| Read calls | `readCallLogs()` in `src/googleSheets.ts` |
| Inbox JSON API | **`GET /api/inbox/calls`** — `src/app/api/inbox/calls/route.ts` |
| Handler | `handleInboxCallsList()` in `src/api-handlers.ts` |
| Clinic auth | Header **`x-clinic-portal-secret`** = env **`CLINIC_PORTAL_SECRET`** |
| Types / mapping | `src/lib/inbox-calls.ts` (camelCase JSON) |

### API contract

**Request**

```http
GET /api/inbox/calls?limit=50
GET /api/inbox/calls?callId=call_1234567890_abcd
GET /api/inbox/calls?companyId=default&limit=50
x-clinic-portal-secret: <same as CLINIC_PORTAL_SECRET on API>
```

**Success**

```json
{
  "ok": true,
  "calls": [
    {
      "timestamp": "2026-06-16T10:27:00.000Z",
      "companyId": "default",
      "callId": "call_1718537220_a1b2c3d4",
      "intent": "dental_enquiry",
      "priority": "P3",
      "emergencyFlag": "No",
      "name": "Jordan Yussuf",
      "phone": "07476811532",
      "postcode": "",
      "issueSummary": "Enquired about veneers",
      "actionTaken": "Booked consultation",
      "smsSent": "SMS03",
      "escalatedTo": "",
      "status": "closed"
    }
  ]
}
```

**Errors**

| Status | Meaning |
|--------|---------|
| 401 | Wrong/missing `x-clinic-portal-secret` |
| 503 | `CLINIC_PORTAL_SECRET` not set on API deployment |

**Query params**

| Param | Default | Notes |
|-------|---------|--------|
| `limit` | 50 | Max 100 |
| `callId` | — | Filter to one call (detail view) |
| `companyId` | Sheet default | Single-clinic usually omit |

Display times in **`Europe/London`**.

---

## What this folder must build

### Pages

| Route | Purpose |
|-------|---------|
| `/inbox/login` | Password form (demo) |
| `/inbox` | Table: when, caller, phone, summary, status |
| `/inbox/calls/[callId]` | Full call detail |

### Server-only proxy (recommended)

Do **not** put `CLINIC_PORTAL_SECRET` in the browser. Use Next Route Handlers:

```text
src/app/api/calls/route.ts          → GET → ${INBOX_API_BASE}/api/inbox/calls
src/app/api/calls/[callId]/route.ts → GET → ...?callId=
src/app/api/auth/login/route.ts     → POST password → set httpOnly session cookie
src/app/api/auth/logout/route.ts    → clear cookie
```

Client components fetch **`/api/calls`** on the same origin (this app), not the external API.

### Demo login (v0)

- Env **`CLINIC_PORTAL_PASSWORD`** — what the clinic types on `/inbox/login`
- On success, set httpOnly cookie (e.g. signed with **`CLINIC_PORTAL_SECRET`** or a dedicated **`INBOX_SESSION_SECRET`**)
- Middleware: protect `/inbox/*` except `/inbox/login`

This is **separate** from ElevenLabs auth (`x-elevenlabs-secret-dentalpro`). Never use the ElevenLabs secret in this app.

---

## Environment variables

### This app (`inbox-portal`)

```env
# API deployment URL (appointment setter on Vercel)
INBOX_API_BASE=https://your-api-project.vercel.app

# Must match CLINIC_PORTAL_SECRET on the API repo (server-only)
CLINIC_PORTAL_SECRET=

# Demo login password shown to clinic staff
CLINIC_PORTAL_PASSWORD=

# Canonical URL for cookies / redirects
NEXT_PUBLIC_APP_URL=https://app.ringaringa.ai
```

### API repo (`appointment setter`) — must also set

```env
CLINIC_PORTAL_SECRET=          # same value as above
GOOGLE_SHEET_ID=               # already required
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
X_ELEVENLABS_SECRET_DENTALPRO=  # agent tools only, not inbox
```

Generate one shared secret, e.g. `openssl rand -hex 32`.

---

## How calls get into the inbox

1. ElevenLabs agent ends call with **`POST /api/log-call`** on the **API** host.
2. API appends a row to **CallLogs** (columns A–N).
3. Inbox portal **GET**s `/api/inbox/calls` and shows the list.

If inbox is empty: agent is not calling `log-call`, or `CLINIC_PORTAL_SECRET` / `INBOX_API_BASE` is wrong.

### Minimal `log-call` body (agent)

```json
{
  "issueSummary": "Enquired about whitening",
  "actionTaken": "Sent booking link",
  "status": "closed",
  "name": "Alex Smith",
  "phone": "+447700900123",
  "smsSent": "SMS03"
}
```

---

## Deploy & domains

| Host | Deploy |
|------|--------|
| `app.ringaringa.ai` | **This folder** (new Vercel project) |
| `api…` / main `*.vercel.app` | **appointment setter** repo |

**DNS for `app`:** CNAME `app` → `cname.vercel-dns.com` (exact value from Vercel Domains UI).

Until DNS exists: deploy both to `*.vercel.app` and set `INBOX_API_BASE` + `NEXT_PUBLIC_APP_URL` to those URLs.

---

## Local dev

**Terminal 1 — API**

```bash
cd /path/to/appointment-setter
# Set CLINIC_PORTAL_SECRET in .env
npm run dev
# → http://localhost:3000
```

**Terminal 2 — this app**

```bash
cd /path/to/inbox-portal
npm install
# .env: INBOX_API_BASE=http://localhost:3000, CLINIC_PORTAL_SECRET=..., CLINIC_PORTAL_PASSWORD=...
npm run dev
# → http://localhost:3001 (use -p 3001 if 3000 taken)
```

**Smoke test API directly**

```bash
curl -s -H "x-clinic-portal-secret: YOUR_SECRET" \
  "http://localhost:3000/api/inbox/calls?limit=5"
```

---

## Suggested stack for this folder

- Next.js 15 App Router (match API repo)
- TypeScript
- Minimal CSS (or Tailwind if app repo already uses it)
- No Supabase in v0 (see `../docs/lite-inbox-demo.md` → “Next move: Supabase”)

---

## Checklist before demo

- [ ] API repo deployed with `CLINIC_PORTAL_SECRET` set
- [ ] At least one row in sheet **CallLogs** (test `log-call` or live agent)
- [ ] This app deployed with matching secret + `INBOX_API_BASE`
- [ ] Login works; list shows calls; detail opens by `callId`
- [ ] `app.ringaringa.ai` DNS attached to this Vercel project (or preview URL for internal demo)

---

## Related docs

- Full spec: `../docs/lite-inbox-demo.md` (in API repo)
- API health UI: `GET /api/health` on API host (public)

---

## Not in scope (v0)

- Supabase / multi-clinic signup
- Transcripts / recordings
- HubSpot embed in inbox
- Using `x-elevenlabs-secret-dentalpro` in this app

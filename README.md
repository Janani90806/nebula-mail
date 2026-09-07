# Nebula Mail — Real Gmail + AI Assistant

This is the real version: a backend that talks to your actual Gmail account, and a
frontend where the AI assistant controls the UI against real emails.

```
nebula-mail-real/
  server/   Express backend — Google OAuth, Gmail API, Claude assistant, push sync
  client/   React (Vite) frontend — inbox/sent/compose/detail + assistant panel
```

## 1. Google Cloud setup (do this first)

1. Go to https://console.cloud.google.com and create a new project (top-left project dropdown → New Project).
2. In the sidebar: **APIs & Services → Library** → search "Gmail API" → click **Enable**.
3. **APIs & Services → OAuth consent screen** → choose **External** → fill in an app name, your email, and add yourself as a **test user** (this lets you sign in without Google reviewing the app).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**.
   - Authorized redirect URI: `http://localhost:8787/auth/google/callback`
5. Copy the **Client ID** and **Client Secret** it gives you — you'll paste these into `server/.env`.

## 2. Anthropic API key

Go to https://console.anthropic.com, create an API key, and keep it handy for `server/.env`.

## 3. Configure and run the server

```bash
cd server
npm install
cp .env.example .env
# open .env and paste in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY,
# and set SESSION_SECRET to any random string
npm run dev
```

You should see `Nebula Mail server running on http://localhost:8787`.

## 4. Run the client

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the printed address (usually `http://localhost:5173`). Click **Sign in with Google**,
approve the consent screen (you'll see a warning that the app isn't verified — that's
expected for a personal test project; click Advanced → Go to [app name]), and you'll land
back in the mail app showing your real inbox.

## 5. Real-time sync (optional but part of the rubric)

The server exposes a webhook at `/webhook/gmail` and a Server-Sent Events stream at
`/api/mail-events` that the frontend already listens to. To actually make Gmail call that
webhook, you need Pub/Sub:

1. In Google Cloud Console: **Pub/Sub → Topics → Create Topic**, e.g. `gmail-push`.
2. Grant Gmail permission to publish to it: **Topic → Permissions → Add Principal** →
   `gmail-api-push@system.gserviceaccount.com` → role **Pub/Sub Publisher**.
3. **Pub/Sub → Subscriptions → Create Subscription** on that topic, delivery type **Push**,
   endpoint URL = your deployed server's `/webhook/gmail` (this must be a public HTTPS URL —
   for local testing, use a tunnel like `ngrok http 8787` and use the ngrok URL).
4. Add `GMAIL_PUBSUB_TOPIC=projects/<your-project-id>/topics/gmail-push` to `server/.env`.
5. After signing in, call `POST http://localhost:8787/api/start-watch` once (e.g. with curl
   or Postman, while your browser session cookie is active) to register the watch.
6. Gmail watches expire after ~7 days — in production you'd re-call `start-watch` on a
   schedule (e.g. a daily cron job).

Without this, the app still works — you'll just need to click Refresh to see new mail
instead of it appearing automatically.

## Architecture decisions

- **Provider-agnostic boundary**: `gmailService.js` is the only file that knows about the
  Gmail API. Swapping to Microsoft Graph means writing a parallel `graphService.js` with the
  same function shapes (`listMessages`, `getMessage`, `sendMessage`) — nothing else changes.
- **Tokens stay server-side**: OAuth tokens live in a signed session cookie handled by the
  Express server; the browser never sees them, and the Anthropic API key never reaches the
  browser either — the frontend calls `/api/assistant`, not Anthropic directly.
- **Assistant tool calls split into two kinds**: "data" tools (`filter_emails`, `open_email`)
  are executed server-side against real Gmail before replying to the model, so the model
  reasons over real results. "UI" tools (`navigate`, `compose_email`, `request_send`) are
  passed straight to the frontend as actions, since only the frontend can update its own
  view state.
- **Human-in-the-loop sending**: `request_send` never sends anything by itself — it always
  requires an explicit Confirm click in the assistant panel, satisfying the human-in-the-loop
  bonus and avoiding accidental sends from a misread instruction.
- **Session-cookie auth, not a database**: fine for a single-user prototype; a real multi-user
  product would need persistent token storage (e.g. Postgres) since cookie sessions don't
  survive server restarts.

## What I'd improve with more time

- Move refresh-token storage to a database so sign-in survives server restarts.
- Add a scheduled job to renew the Gmail watch automatically instead of a manual endpoint.
- Add optimistic UI updates for send/reply instead of waiting for the round trip.
- Thread/conversation view (group by `threadId`, which the backend already returns).
- Automated tests for `buildQuery` and the tool-execution logic in `assistant.js`.

## Deliverables checklist

- [ ] Push this to a **private** GitHub repo
- [ ] Add collaborators: `Aswath363`, `akshaiP`, `ashwanthnebula`
- [ ] Record a short screen capture showing the assistant filling compose, filtering the
      inbox, and opening a specific email — add it (or a link to it) to this README
- [ ] Fill in the "What I'd improve" section above in your own words if you extend it further

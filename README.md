# Nebula Mail — Real Gmail + AI Assistant

Nebula Mail is a Gmail-like web application that allows users to view, search, manage, compose, reply to, forward, and send emails through their Google Gmail account.

It also includes an AI Assistant powered by Google Gemini, which can understand natural-language commands and control the application's UI.

Features
Google OAuth authentication
View real Gmail inbox and emails
Inbox, Sent, Starred, Drafts, Archive, and Trash
Search and filter emails
Open specific emails using natural-language commands
Compose and send emails
Reply to emails
Forward emails
Star/unstar emails
Mark emails as read/unread
Archive and trash emails
AI Assistant with Gemini function calling
Human confirmation before sending emails
Real-time email update support using Server-Sent Events and Gmail Pub/Sub
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

## 2. Google Gemini API Key

Nebula Mail uses the Google Gemini API for its AI Assistant.

Create a Gemini API key through Google AI Studio.
Copy the API key.
Add it to server/.env:
GEMINI_API_KEY=your_gemini_api_key

The Gemini API key is stored on the server and is never exposed to the frontend.

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

## 5. AI Assistant

The AI Assistant is one of the main features of Nebula Mail.
It uses the Google Gemini API with function calling to understand natural-language commands and control the application.

Examples:

Show me unread emails
Show emails from the last 10 days
Open my latest email
Compose an email to john@example.com with subject Meeting Tomorrow
Reply to this email and say I'll attend the meeting
Forward this email to john@example.com

The assistant can perform UI actions such as:

Navigate between folders
Open emails
Filter/search emails
Open the compose screen
Pre-fill email fields
Request confirmation before sending
Human-in-the-loop sending

The assistant does not automatically send an email.

When the user asks the assistant to send an email, the application requires explicit confirmation before the email is actually sent. This helps prevent accidental email sending.

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
- Add stronger production-level security and monitoring.
- Improve the overall UI responsiveness and accessibility.

## Tech Stack
 Frontend
       React
       JavaScript
       HTML
       CSS
 Backend
       Node.js
       Express.js
       Google Gmail API
       Google OAuth 2.0
 AI
    Google Gemini API
    Gemini Function Calling
## Demo Video
[Watch Demo Video}(https://drive.google.com/file/d/17AtmGT1XboUeOLf9_o8tGNJFJMgVRLKm/view?usp=sharing)

## Deliverables checklist

- [ ] GitHub repository created
- [ ] Add collaborators: `Aswath363`, `akshaiP`, `ashwanthnebula`
- [ ] Record a short screen capture showing the assistant filling compose, filtering the
      inbox, and opening a specific email — add it (or a link to it) to this README
- [ ] Fill in the "What I'd improve" section above in your own words if you extend it further

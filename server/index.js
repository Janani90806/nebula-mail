import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieSession from "cookie-session";
import { makeOAuthClient, gmailFor, buildQuery, listMessages, getMessage, markRead, setReadState, setStarred, archiveMessage,trashMessage ,sendMessage, startWatch } from "./gmailService.js";
import { converse } from "./assistant.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(
  cookieSession({
    name: "nebula_session",
    secret: process.env.SESSION_SECRET,
    maxAge: 24 * 60 * 60 * 1000,
  })
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

app.get("/auth/google", (req, res) => {
  const oauth2Client = makeOAuthClient();
  const url = oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(req.query.code);
    req.session.tokens = tokens;
    res.redirect(process.env.CLIENT_ORIGIN);
  } catch (err) {
    console.error(err);
    res.status(500).send("Google sign-in failed. Check GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI in .env.");
  }
});

app.get("/auth/status", (req, res) => {
  res.json({ signedIn: !!req.session.tokens });
});

app.post("/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (!req.session.tokens) return res.status(401).json({ error: "Not signed in. Visit /auth/google first." });
  next();
}

app.get("/api/emails", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);

    const {
      folder = "inbox",
      days,
      sender,
      keyword,
      unread_only,
      pageToken
    } = req.query;

    const query = buildQuery({
      folder,
      days: days ? Number(days) : undefined,
      sender,
      keyword,
      unread_only: unread_only === "true"
    });

    const result = await listMessages(
      gmail,
      query,
      50,
      pageToken
    );

    res.json({
      emails: result.emails,
      nextPageToken: result.nextPageToken
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch emails." });
  }
});

app.get("/api/emails/:id", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);
    const email = await getMessage(gmail, req.params.id);
    if (!email.read) await markRead(gmail, req.params.id);
    res.json({ email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch email." });
  }
});

app.post("/api/emails/:id/action", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);
    const { action } = req.body;
    if (action === "star") await setStarred(gmail, req.params.id, true);
    else if (action === "unstar") await setStarred(gmail, req.params.id, false);
    else if (action === "read") await setReadState(gmail, req.params.id, true);
    else if (action === "unread") await setReadState(gmail, req.params.id, false);
    else if (action === "archive") await archiveMessage(gmail, req.params.id);
    else if (action === "trash") await trashMessage(gmail, req.params.id);
    else return res.status(400).json({ error: "Unknown action." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Action failed." });
  }
});

app.post("/api/send", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);
    const { to, subject, body, threadId } = req.body;
    const result = await sendMessage(gmail, { to, subject, body, threadId });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

app.post("/api/assistant", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);
    const { userText, history = [], context = {} } = req.body;
    const result = await converse(gmail, { userText, history, context });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Assistant request failed." });
  }
});

const sseClients = new Set();

app.get("/api/mail-events", requireAuth, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function broadcastNewMail() {
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify({ type: "new_mail" })}\n\n`);
  }
}

app.post("/webhook/gmail", (req, res) => {
  broadcastNewMail();
  res.status(204).end();
});

app.post("/api/start-watch", requireAuth, async (req, res) => {
  try {
    const gmail = gmailFor(req.session.tokens);
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) return res.status(400).json({ error: "Set GMAIL_PUBSUB_TOPIC in .env first." });
    const data = await startWatch(gmail, topicName);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start watch." });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Nebula Mail server running on http://localhost:${port}`));
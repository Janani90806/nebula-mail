import { google } from "googleapis";

function parseMessage(msg) {
  const headers = msg.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  let body = "";
  const findBody = (part) => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    if (part.parts) {
      for (const p of part.parts) {
        const found = findBody(p);
        if (found) return found;
      }
    }
    return "";
  };
  body = findBody(msg.payload) || msg.snippet || "";

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: get("From"),
    to: get("To"),
    subject: get("Subject") || "(no subject)",
    preview: msg.snippet || "",
    body,
    date: get("Date") ? new Date(get("Date")).getTime() : Number(msg.internalDate),
    read: !(msg.labelIds || []).includes("UNREAD"),
    starred: (msg.labelIds || []).includes("STARRED"),
    labelIds: msg.labelIds || [],
  };
}

export function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function gmailFor(tokens) {
  const auth = makeOAuthClient();
  auth.setCredentials(tokens);
  return google.gmail({ version: "v1", auth });
}

export function buildQuery({ folder, days,after_date,
  before_date, sender, keyword, unread_only }) {
  const parts = [];
  if (folder === "sent") parts.push("in:sent");
  else if (folder === "starred") parts.push("is:starred");
  else if (folder === "drafts") parts.push("in:drafts");
  else if (folder === "archive") parts.push("-in:inbox", "-in:sent", "-in:trash", "-in:spam", "-in:drafts");
    else if (folder === "trash") parts.push("in:trash");
  else parts.push("in:inbox");
  if (days) parts.push(`newer_than:${days}d`);
  if (after_date) parts.push(`after:${after_date}`);
if (before_date) parts.push(`before:${before_date}`);
  if (sender) parts.push(`from:${sender}`);
  if (keyword) parts.push(`"${keyword}"`);
  if (unread_only) parts.push("is:unread");
  return parts.join(" ");
}

export async function listMessages(gmail, query, maxResults = 50, pageToken) {
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
    pageToken
  });

  const ids = list.data.messages || [];

  const full = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full"
      })
    )
  );

  return {
    emails: full.map((r) => parseMessage(r.data)),
    nextPageToken: list.data.nextPageToken || null
  };
}

export async function getMessage(gmail, id) {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  return parseMessage(res.data);
}

export async function markRead(gmail, id) {
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] } });
}

export async function setReadState(gmail, id, read) {
  if (read) await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] } });
  else await gmail.users.messages.modify({ userId: "me", id, requestBody: { addLabelIds: ["UNREAD"] } });
}

export async function setStarred(gmail, id, starred) {
  if (starred) await gmail.users.messages.modify({ userId: "me", id, requestBody: { addLabelIds: ["STARRED"] } });
  else await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["STARRED"] } });
}

export async function archiveMessage(gmail, id) {
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["INBOX"] } });
}

export async function trashMessage(gmail, id) {
  await gmail.users.messages.trash({ userId: "me", id });
}

function buildRawMessage({ to, subject, body }) {
  const messageParts = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body];
  const message = messageParts.join("\n");
  return Buffer.from(message).toString("base64url");
}

export async function sendMessage(gmail, { to, subject, body, threadId }) {
  const raw = buildRawMessage({ to, subject, body });
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });
  return res.data;
}

export async function startWatch(gmail, topicName) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: { topicName, labelIds: ["INBOX"] },
  });
  return res.data;
}
import { buildQuery, listMessages } from "./gmailService.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "navigate",
        description: "Switch the main panel to a different view.",
        parameters: {
          type: "OBJECT",
          properties: { view: { type: "STRING", enum: ["inbox", "sent", "starred", "drafts", "archive","trash", "compose"] } },
          required: ["view"],
        },
      },
      {
        name: "compose_email",
        description: "Open the compose view and pre-fill To, Subject, Body. Use for new emails, replies, and forwards.",
        parameters: {
          type: "OBJECT",
          properties: { to: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" } },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "request_send",
        description: "Ask to send the email currently in the compose form. Always requires explicit user confirmation in the UI before anything is actually sent.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "filter_emails",
        description: "Search/filter real emails and show them in the given folder. Use for any 'show me...' / 'find...' request.",
        parameters: {
          type: "OBJECT",
          properties: {
            folder: { type: "STRING", enum: ["inbox", "sent", "starred", "drafts", "archive","trash"] },
            days: { type: "NUMBER" },
            after_date: { type: "STRING" },
before_date: { type: "STRING" },
            sender: { type: "STRING" },
            keyword: { type: "STRING" },
            unread_only: { type: "BOOLEAN" },
          },
          required: ["folder"],
        },
      },
      {
        name: "open_email",
        description: "Find and open one specific real email in the detail view.",
        parameters: {
          type: "OBJECT",
          properties: {
            folder: { type: "STRING", enum: ["inbox", "sent", "starred", "drafts", "archive", "trash"] },
            sender: { type: "STRING" },
            keyword: { type: "STRING" },
            which: { type: "STRING", enum: ["latest", "oldest"] },
          },
        },
      },
    ],
  },
];

function systemPrompt(ctx) {
  return `You are the in-app assistant for Nebula Mail, a real email client connected to the user's Gmail. You control the UI by calling functions instead of just describing actions.

Current app state:
- View: ${ctx.view}
- Open email: ${ctx.openEmail ? `"${ctx.openEmail.subject}" from ${ctx.openEmail.from}` : "none"}
- Compose draft: ${ctx.draft && (ctx.draft.to || ctx.draft.subject) ? JSON.stringify(ctx.draft) : "empty"}

Rules:
- If the user asks to "reply", "reply to this", or "respond" while an email is open:
  - Use the open email as the reply target.
  - Set the To address to the original sender's email address.
  - Set the subject to "Re: " + the original subject, unless it already starts with "Re:".
  - Write the reply body based on exactly what the user requested.
  - Use the compose_email function to open the compose screen.
  - Do NOT send the email automatically.
  - If the user asks to "forward", "forward this", or "forward this email" while an email is open:
  - Use the open email as the email being forwarded.
  - Use the email address specified by the user as the To address.
  - Set the subject to "Fwd: " + the original subject, unless it already starts with "Fwd:".
  - Do NOT include the original email content yourself.
- The UI will automatically append the original email content to the forwarded message.
- Put only the user's requested message in the body.
  - Use the compose_email function to open the compose screen.
  - Do NOT send the email automatically.
- If the user says "this"/"it" and an email is open, treat the open email as the referenced email.
- Never call request_send unless the user clearly asked to send, or already confirmed.
- After function calls, give one short plain-language sentence confirming what happened.
- No markdown headers in replies.`;
}

async function runTool(gmail, name, args) {
  switch (name) {
    case "navigate":
      return { action: { type: "navigate", view: args.view }, toolResult: { done: true, view: args.view } };
    case "compose_email":
      return { action: { type: "compose_email", ...args }, toolResult: { done: true } };
    case "request_send":
      return { action: { type: "request_send" }, toolResult: { waitingForConfirmation: true } };
    case "filter_emails": {
      const query = buildQuery(args);
      const result = await listMessages(gmail, query, 8);
      const results = result.emails;
      return {
        action: { type: "filter_emails", folder: args.folder, results },
        toolResult: { count: results.length, subjects: results.map((r) => r.subject) },
      };
    }
    case "open_email": {
      const query = buildQuery({ folder: args.folder || "inbox", sender: args.sender, keyword: args.keyword });
      const result = await listMessages(gmail, query, 5);
      const results = result.emails;
      const sorted = [...results].sort((a, b) => (args.which === "oldest" ? a.date - b.date : b.date - a.date));
      const match = sorted[0];
      if (!match) return { action: null, toolResult: { found: false } };
      return { action: { type: "open_email", email: match }, toolResult: { found: true, subject: match.subject } };
    }
    default:
      return { action: null, toolResult: { error: "unknown tool" } };
  }
}

function toGeminiHistory(history) {
  return history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
}

export async function converse(gmail, { userText, history, context }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in server/.env");

  let contents = [...toGeminiHistory(history), { role: "user", parts: [{ text: userText }] }];
  const actions = [];
  let finalText = "";
  let guard = 0;

  while (guard < 4) {
    guard += 1;
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        tools: TOOLS,
        systemInstruction: { parts: [{ text: systemPrompt(context) }] },
      }),
    });
    const data = await resp.json();

if (data.error) {
  console.error("GEMINI ERROR:", data.error);
  throw new Error(data.error.message || "Gemini request failed");
}

    const parts = data.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join(" ");
    const functionCalls = parts.filter((p) => p.functionCall);

    if (textParts) finalText = textParts;
    if (functionCalls.length === 0) break;

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      const { action, toolResult } = await runTool(gmail, fc.functionCall.name, fc.functionCall.args || {});
      if (action) actions.push(action);
      responseParts.push({ functionResponse: { name: fc.functionCall.name, response: toolResult } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return { text: finalText || "Done.", actions };
}
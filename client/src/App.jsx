import React, {
  useState,
  useEffect,
  useRef,
  useCallback
} from "react";

import {
  Inbox,
  Send,
  PenSquare,
  Bot,
  ChevronLeft,
  Reply,
  Sparkles,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  Star,
  FileEdit,
  Archive,
  Sun,
  Moon,
  Mail,
  MailOpen,
  MoreHorizontal,
  CheckSquare,
  Square,
  Trash2,
  Menu,
  ChevronDown,
  ArrowLeft,
  Clock,
  Paperclip
} from "lucide-react";

const API = "http://localhost:8787";

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

const nameOf = (addr = "") =>
  addr.split("<")[0].trim() || addr;

const emailOf = (addr = "") =>
  (addr.match(/<(.+)>/) || [, addr])[1];

const fmtDate = (ts) => {
  if (!ts) return "";

  const d = new Date(ts);

  const diffDays = Math.floor(
    (Date.now() - ts) / 86400000
  );

  if (diffDays === 0) {
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
};

function groupByThread(emails) {
  const latestByThread = new Map();
  const countByThread = new Map();

  for (const e of emails) {
    const key = e.threadId || e.id;
    countByThread.set(key, (countByThread.get(key) || 0) + 1);

    const existing = latestByThread.get(key);
    if (!existing || e.date > existing.date) {
      latestByThread.set(key, e);
    }
  }

  return [...latestByThread.values()]
    .sort((a, b) => b.date - a.date)
    .map((e) => ({ ...e, threadCount: countByThread.get(e.threadId || e.id) }));
}

/* -------------------------------------------------------
   MAIN APP
------------------------------------------------------- */

export default function App() {
  const [signedIn, setSignedIn] = useState(null);

  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [starred, setStarred] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [archive, setArchive] = useState([]);
    const [trash, setTrash] = useState([]);
  const [pageTokens, setPageTokens] = useState({
  inbox: null,
  sent: null,
  starred: null,
  drafts: null,
  archive: null,
    trash: null
});

  const [view, setView] = useState("inbox");

  const [filter, setFilter] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState("");
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [senderFilter, setSenderFilter] = useState("");

  const [openEmail, setOpenEmail] = useState(null);

  const [draft, setDraft] = useState({
    to: "",
    subject: "",
    body: ""
  });

  const [loading, setLoading] = useState(false);

  const [selectedEmails, setSelectedEmails] = useState([]);

  const [chat, setChat] = useState([
    {
      role: "assistant",
      text:
        'Connected to Gmail. Try "show unread emails" or open an email and say "reply to this".'
    }
  ]);

  const [chatInput, setChatInput] = useState("");

  const [thinking, setThinking] = useState(false);

  const [pendingSend, setPendingSend] = useState(false);

  const [toast, setToast] = useState(null);

  const [darkMode, setDarkMode] = useState(false);

  const chatEndRef = useRef(null);

  /* -------------------------------------------------------
     TOAST
  ------------------------------------------------------- */

  const showToast = (msg) => {
    setToast(msg);

    setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  /* -------------------------------------------------------
     AUTH
  ------------------------------------------------------- */

  useEffect(() => {
    fetch(`${API}/auth/status`, {
      credentials: "include"
    })
      .then((r) => r.json())
      .then((d) => setSignedIn(d.signedIn))
      .catch(() => setSignedIn(false));
  }, []);

  /* -------------------------------------------------------
     LOAD EMAILS
  ------------------------------------------------------- */

  const loadEmails = useCallback(
  async (folder, f = {}, append = false) => {
    setLoading(true);

    const token = append ? pageTokens[folder] : null;

    const params = new URLSearchParams({
      folder,
      ...f
    });

    if (token) {
      params.set("pageToken", token);
    }

    try {
      const res = await fetch(
        `${API}/api/emails?${params.toString()}`,
        {
          credentials: "include"
        }
      );

      const data = await res.json();

      setPageTokens((prev) => ({
        ...prev,
        [folder]: data.nextPageToken || null
      }));

      if (folder === "sent") {
        setSent((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      } else if (folder === "starred") {
        setStarred((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      } else if (folder === "drafts") {
        setDrafts((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      } else if (folder === "archive") {
        setArchive((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      } else if (folder === "trash") {
        setTrash((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      }else {
        setInbox((prev) =>
          append ? [...prev, ...(data.emails || [])] : data.emails || []
        );
      }
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
  },
  [pageTokens]
);

/* -------------------------------------------------------
   INITIAL EMAIL LOAD
------------------------------------------------------- */

useEffect(() => {
  if (!signedIn) return;

  loadEmails("inbox");
  loadEmails("sent");
  loadEmails("starred");
}, [signedIn]);

  /* -------------------------------------------------------
     REAL TIME MAIL
  ------------------------------------------------------- */

  useEffect(() => {
    if (!signedIn) return;

    const es = new EventSource(
      `${API}/api/mail-events`,
      {
        withCredentials: true
      }
    );

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "new_mail") {
        showToast("New email received");

        loadEmails(
          "inbox",
          filter?.folder === "inbox"
            ? filter
            : {}
        );
      }
    };

    return () => es.close();
  }, [
    signedIn,
    loadEmails,
    filter
  ]);

  /* -------------------------------------------------------
     CHAT SCROLL
  ------------------------------------------------------- */

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [chat, thinking]);

  /* -------------------------------------------------------
     FOLDER DATA
  ------------------------------------------------------- */

  const folderData = {
    inbox,
    sent,
    starred,
    drafts,
    archive,
    trash
  };
   const currentFolder = filter?.folder || view;
const hasMore = !!pageTokens[currentFolder];
  const visibleList = filter
    ? folderData[filter.folder] || []
    : folderData[view] || [];
    const threadedList = groupByThread(visibleList);

  const unreadCount = inbox.filter(
    (e) => !e.read
  ).length;

  /* -------------------------------------------------------
     SEARCH
  ------------------------------------------------------- */

  const runSearch = (e) => {
    e.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      setFilter(null);
      loadEmails(view);
      return;
    }

    const f = {
      folder: view,
      keyword: term
    };

    setFilter(f);

    loadEmails(view, {
      keyword: term
    });
  };

  const applyFilters = () => {
    const f = { folder: view };
    if (dateFilter) f.days = Number(dateFilter);
    if (unreadFilter) f.unread_only = true;
    if (senderFilter.trim()) f.sender = senderFilter.trim();
    if (searchTerm.trim()) f.keyword = searchTerm.trim();
    const hasAny = dateFilter || unreadFilter || senderFilter.trim() || searchTerm.trim();
    if (!hasAny) { setFilter(null); loadEmails(view); return; }
    setFilter(f);
    loadEmails(view, f);
  };

  const clearAllFilters = () => {
    setDateFilter(""); setUnreadFilter(false); setSenderFilter(""); setSearchTerm("");
    setFilter(null);
    loadEmails(view);
  };

  /* -------------------------------------------------------
     OPEN EMAIL
  ------------------------------------------------------- */

  const openEmailById = async (id, folder) => {
    try {
      const res = await fetch(
        `${API}/api/emails/${id}`,
        {
          credentials: "include"
        }
      );

      const data = await res.json();

      setOpenEmail(data.email);

      setFilter(null);

      setView(folder || "inbox");

      setSelectedEmails([]);

      if (folder === "inbox" || !folder) {
        loadEmails("inbox");
      }
    } catch (err) {
      console.error(err);
      showToast("Unable to open email");
    }
  };

  /* -------------------------------------------------------
     EMAIL ACTION
  ------------------------------------------------------- */

  const emailAction = async (
    id,
    action,
    folder
  ) => {
    try {
      const res = await fetch(
        `${API}/api/emails/${id}/action`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            action
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Action failed"
        );
      }

      /* Update opened email */

      if (openEmail?.id === id) {
        if (action === "star") {
          setOpenEmail((e) => ({
            ...e,
            starred: true
          }));
        }

        if (action === "unstar") {
          setOpenEmail((e) => ({
            ...e,
            starred: false
          }));
        }

        if (action === "read") {
          setOpenEmail((e) => ({
            ...e,
            read: true
          }));
        }

        if (action === "unread") {
          setOpenEmail((e) => ({
            ...e,
            read: false
          }));
        }
      }

      const currentFolder =
        folder || view;

      if (filter) {
        const {
          folder: filterFolder,
          ...filterParams
        } = filter;

        await loadEmails(
          filterFolder || currentFolder,
          filterParams
        );
      } else {
        await loadEmails(
          currentFolder
        );
      }

      /* Refresh starred folder too */

      if (
        action === "star" ||
        action === "unstar"
      ) {
        await loadEmails("starred");
      }

      /* Refresh inbox */

      if (
        currentFolder === "inbox" ||
        action === "archive" ||
         action === "trash" ||
        action === "read" ||
        action === "unread"
      ) {
        await loadEmails("inbox");
      }

      if (action === "star") {
        showToast("Added to Starred");
      }

      if (action === "unstar") {
        showToast("Removed from Starred");
      }

      if (action === "read") {
        showToast("Marked as read");
      }

      if (action === "unread") {
        showToast("Marked as unread");
      }

      if (action === "archive") {
        showToast("Email archived");
      }
    } catch (err) {
      console.error(err);
      showToast("Action failed");
    }
  };

  /* -------------------------------------------------------
     SELECT EMAIL
  ------------------------------------------------------- */

  const toggleSelect = (
    e,
    id
  ) => {
    e.stopPropagation();

    setSelectedEmails((current) => {
      if (current.includes(id)) {
        return current.filter(
          (x) => x !== id
        );
      }

      return [
        ...current,
        id
      ];
    });
  };

  /* -------------------------------------------------------
     SELECT ALL
  ------------------------------------------------------- */

  const toggleSelectAll = () => {
  if (selectedEmails.length === threadedList.length) {
    setSelectedEmails([]);
  } else {
    setSelectedEmails(threadedList.map((e) => e.id));
  }
};

  /* -------------------------------------------------------
     BULK READ / UNREAD
  ------------------------------------------------------- */

  const markSelected = async (
    action
  ) => {
    if (
      selectedEmails.length === 0
    ) {
      showToast(
        "Select an email first"
      );
      return;
    }

    for (const id of selectedEmails) {
      await emailAction(
        id,
        action,
        view
      );
    }

    setSelectedEmails([]);

    showToast(
      action === "read"
        ? "Emails marked as read"
        : "Emails marked as unread"
    );
  };

  /* -------------------------------------------------------
     BULK ARCHIVE
  ------------------------------------------------------- */

  const archiveSelected =
    async () => {
      if (
        selectedEmails.length === 0
      ) {
        showToast(
          "Select an email first"
        );
        return;
      }

      for (const id of selectedEmails) {
        await emailAction(
          id,
          "archive",
          view
        );
      }

      setSelectedEmails([]);

      showToast(
        "Emails archived"
      );
    };

  const deleteSelected = async () => {
    if (selectedEmails.length === 0) {
      showToast("Select an email first");
      return;
    }
    for (const id of selectedEmails) {
      await emailAction(id, "trash", view);
    }
    setSelectedEmails([]);
    showToast("Emails deleted");
  };

  /* -------------------------------------------------------
     SEND EMAIL
  ------------------------------------------------------- */

  const confirmSend =
    async () => {
      try {
        const res =
          await fetch(
            `${API}/api/send`,
            {
              method: "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify(
                draft
              )
            }
          );

        if (!res.ok) {
          throw new Error(
            "Send failed"
          );
        }

        setPendingSend(false);

        setDraft({
          to: "",
          subject: "",
          body: ""
        });

        setView("sent");

        loadEmails("sent");

        showToast(
          "Email sent successfully"
        );

        setChat((c) => [
          ...c,
          {
            role: "assistant",
            text: "Email sent successfully."
          }
        ]);
      } catch (e) {
        showToast(
          "Send failed"
        );
      }
    };

  const cancelSend = () => {
    setPendingSend(false);

    setChat((c) => [
      ...c,
      {
        role: "assistant",
        text: "Okay, I didn't send it."
      }
    ]);
  };

  /* -------------------------------------------------------
     ASSISTANT ACTION
  ------------------------------------------------------- */

  const applyAction = (
    action
  ) => {
    switch (
      action.type
    ) {
      case "navigate":
        setFilter(null);
        setOpenEmail(null);
        setView(action.view);
        if (["inbox", "sent", "starred", "drafts", "archive", "trash"].includes(action.view)) {
          loadEmails(action.view);
        }
        break;

      case "compose_email": {
  let finalBody = action.body || "";

  if (
    (action.subject || "").toLowerCase().startsWith("fwd:") &&
    openEmail
  ) {
    finalBody =
      finalBody +
      "\n\n---------- Forwarded message ----------\n" +
      `From: ${openEmail.from || ""}\n` +
      `To: ${openEmail.to || ""}\n` +
      `Subject: ${openEmail.subject || ""}\n\n` +
      `${openEmail.body || openEmail.preview || ""}`;
  }

  setDraft({
    to: action.to || "",
    subject: action.subject || "",
    body: finalBody
    
  });

  setFilter(null);
  setOpenEmail(null);
  setView("compose");
  break;
}

      case "request_send":
        setPendingSend(true);
        break;

      case "filter_emails": {
        const f = {
          folder:
            action.folder
        };

        setFilter(f);
        setOpenEmail(null);
        setView(
          action.folder
        );

        if (
          action.folder ===
          "sent"
        ) {
          setSent(
            action.results
          );
        } else if (
          action.folder ===
          "starred"
        ) {
          setStarred(
            action.results
          );
        } else if (
          action.folder ===
          "drafts"
        ) {
          setDrafts(
            action.results
          );
        } else if (
          action.folder ===
          "archive"
        ) {
          setArchive(
            action.results
          );
        } else if (action.folder === "trash") {
          setTrash(action.results);
        }else {
          setInbox(
            action.results
          );
        }

        break;
      }

      case "open_email":
        setFilter(null);
        setOpenEmail(
          action.email
        );

        setView(
          action.email.labelIds?.includes(
            "SENT"
          )
            ? "sent"
            : "inbox"
        );

        break;

      default:
        break;
    }
  };

  /* -------------------------------------------------------
     AI ASSISTANT
  ------------------------------------------------------- */

  const askAssistant =
    async (userText) => {
      setChat((c) => [
        ...c,
        {
          role: "user",
          text: userText
        }
      ]);

      setThinking(true);

      try {
        const history =
          chat
            .filter(
              (m) =>
                m.role ===
                  "user" ||
                m.role ===
                  "assistant"
            )
            .slice(-8)
            .map((m) => ({
              role:
                m.role,
              content:
                m.text
            }));

        const context = {
          view,
          openEmail,
          draft
        };

        const res =
          await fetch(
            `${API}/api/assistant`,
            {
              method: "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                userText,
                history,
                context
              })
            }
          );

        const data =
          await res.json();

        if (data.error) {
          setChat((c) => [
            ...c,
            {
              role: "assistant",
              text:
                `Error: ${data.error}`
            }
          ]);
        } else {
  (data.actions || []).forEach(applyAction);

  // Find the most recent action that actually contains emails to preview
  const previewAction = [...(data.actions || [])]
    .reverse()
    .find((a) => a.type === "filter_emails" || a.type === "open_email");

  setChat((c) => [
    ...c,
    {
      role: "assistant",
      text: data.text,
      preview: previewAction || null
    }
  ]);
}
      } catch (e) {
        setChat((c) => [
          ...c,
          {
            role: "assistant",
            text:
              "Couldn't reach the server. Is it running on port 8787?"
          }
        ]);
      } finally {
        setThinking(false);
      }
    };

  const handleChatSubmit =
    (e) => {
      e.preventDefault();

      const text =
        chatInput.trim();

      if (
        !text ||
        thinking
      )
        return;

      setChatInput("");

      askAssistant(text);
    };

  /* -------------------------------------------------------
     THEME
  ------------------------------------------------------- */

  const bg = darkMode
    ? "#202124"
    : "#f6f8fc";

  const panel = darkMode
    ? "#292a2d"
    : "#ffffff";

  const headerBg = darkMode
    ? "#202124"
    : "#ffffff";

  const ink = darkMode
    ? "#e8eaed"
    : "#202124";

  const sub = darkMode
    ? "#9aa0a6"
    : "#5f6368";

  const line = darkMode
    ? "#3c4043"
    : "#e0e3e7";

  const hover = darkMode
    ? "#303134"
    : "#f2f6fc";

  const selected = darkMode
    ? "#3c4043"
    : "#e8f0fe";

  const accent = "#1a73e8";

  const assistantBg =
    darkMode
      ? "#202124"
      : "#f8fafd";

  /* -------------------------------------------------------
     SIGN IN CHECK
  ------------------------------------------------------- */

  if (signedIn === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          height: "100vh",
          fontFamily:
            "Arial, sans-serif",
          color: sub,
          background: bg
        }}
      >
        Checking sign-in
        status…
      </div>
    );
  }

  /* -------------------------------------------------------
     SIGN IN PAGE
  ------------------------------------------------------- */

  if (!signedIn) {
    return (
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          height: "100vh",
          background:
            "#f6f8fc",
          fontFamily:
            "Arial, sans-serif",
          flexDirection:
            "column",
          gap: 18
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 600,
            color: "#1a73e8"
          }}
        >
          Nebula Mail
        </div>

        <div
          style={{
            color: "#5f6368",
            fontSize: 14,
            maxWidth: 340,
            textAlign:
              "center"
          }}
        >
          Sign in with Google
          to connect your real
          Gmail inbox.
        </div>

        <a
          href={`${API}/auth/google`}
          style={{
            display: "flex",
            alignItems:
              "center",
            gap: 8,
            background:
              "#1a73e8",
            color: "#fff",
            padding:
              "11px 20px",
            borderRadius: 6,
            textDecoration:
              "none",
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <LogIn size={17} />
          Sign in with Google
        </a>
      </div>
    );
  }

  /* -------------------------------------------------------
     MAIN UI
  ------------------------------------------------------- */

  return (
    <div
      style={{
        fontFamily:
          "Arial, Helvetica, sans-serif",
        background: bg,
        color: ink,
        height: "100vh",
        display: "flex",
        position:
          "relative",
        overflow: "hidden"
      }}
    >

      {/* TOAST */}

      {toast && (
        <div
          style={{
            position:
              "absolute",
            top: 70,
            left: "50%",
            transform:
              "translateX(-50%)",
            background:
              darkMode
                ? "#303134"
                : "#323232",
            color: "#fff",
            padding:
              "10px 18px",
            borderRadius: 6,
            fontSize: 13,
            zIndex: 100,
            boxShadow:
              "0 2px 8px rgba(0,0,0,.25)"
          }}
        >
          {toast}
        </div>
      )}

      {/* ==================================================
          LEFT SIDEBAR
      ================================================== */}

      <div
        style={{
          width: 230,
          background:
            darkMode
              ? "#202124"
              : "#f6f8fc",
          display: "flex",
          flexDirection:
            "column",
          flexShrink: 0,
          padding:
            "18px 12px"
        }}
      >

        {/* LOGO */}

        <div
          style={{
            display: "flex",
            alignItems:
              "center",
            gap: 10,
            padding:
              "0 12px 22px"
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background:
                "#1a73e8",
              color: "#fff",
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              fontWeight: 700,
              fontSize: 17
            }}
          >
            N
          </div>

          <span
            style={{
              fontSize: 20,
              fontWeight: 600
            }}
          >
            Nebula Mail
          </span>
        </div>

        {/* COMPOSE */}

        <button
          onClick={() => {
            setDraft({
              to: "",
              subject: "",
              body: ""
            });

            setFilter(null);
            setOpenEmail(null);
            setView("compose");
          }}
          style={{
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            gap: 10,
            background:
              darkMode
                ? "#303134"
                : "#c2e7ff",
            color:
              darkMode
                ? "#e8eaed"
                : "#001d35",
            border: "none",
            borderRadius: 16,
            padding:
              "13px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            margin:
              "0 8px 18px"
          }}
        >
          <PenSquare size={18} />
          Compose
        </button>

        {/* NAVIGATION */}

        <NavItem
          icon={
            <Inbox size={19} />
          }
          label="Inbox"
          count={
            unreadCount
          }
          active={
            view === "inbox"
          }
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails(
              []
            );
            setView("inbox");
            loadEmails(
              "inbox"
            );
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />

        <NavItem
          icon={
            <Star size={19} />
          }
          label="Starred"
          active={
            view === "starred"
          }
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails(
              []
            );
            setView("starred");
            loadEmails(
              "starred"
            );
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />

        <NavItem
          icon={
            <Send size={19} />
          }
          label="Sent"
          active={
            view === "sent"
          }
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails(
              []
            );
            setView("sent");
            loadEmails(
              "sent"
            );
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />

        <NavItem
          icon={
            <FileEdit size={19} />
          }
          label="Drafts"
          active={
            view === "drafts"
          }
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails(
              []
            );
            setView("drafts");
            loadEmails(
              "drafts"
            );
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />

        <NavItem
          icon={
            <Archive size={19} />
          }
          label="Archive"
          active={
            view === "archive"
          }
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails(
              []
            );
            setView("archive");
            loadEmails(
              "archive"
            );
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />
          
       <NavItem
          icon={<Trash2 size={19} />}
          label="Trash"
          active={view === "trash"}
          onClick={() => {
            setFilter(null);
            setSearchTerm("");
            setOpenEmail(null);
            setSelectedEmails([]);
            setView("trash");
            loadEmails("trash");
          }}
          accent={accent}
          selected={selected}
          ink={ink}
        />

        <div
          style={{
            marginTop: 18,
            borderTop:
              `1px solid ${line}`,
            paddingTop: 14
          }}
        >
          <button
            onClick={() =>
              loadEmails(view)
            }
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 10,
              border: "none",
              background:
                "transparent",
              color: sub,
              padding:
                "9px 14px",
              fontSize: 13,
              cursor:
                "pointer",
              width: "100%",
              textAlign:
                "left"
            }}
          >
            <RefreshCw
              size={16}
            />
            Refresh
          </button>

          <button
            onClick={() =>
              setDarkMode(
                (d) => !d
              )
            }
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 10,
              border: "none",
              background:
                "transparent",
              color: sub,
              padding:
                "9px 14px",
              fontSize: 13,
              cursor:
                "pointer",
              width: "100%",
              textAlign:
                "left"
            }}
          >
            {darkMode ? (
              <Sun size={16} />
            ) : (
              <Moon size={16} />
            )}

            {darkMode
              ? "Light mode"
              : "Dark mode"}
          </button>
        </div>
      </div>

      {/* ==================================================
          CENTER
      ================================================== */}

      <div
        style={{
          flex: 1,
          display: "flex",
          minWidth: 0,
          flexDirection:
            "column"
        }}
      >

        {/* TOP HEADER */}

        <div
          style={{
            height: 64,
            background:
              headerBg,
            borderBottom:
              `1px solid ${line}`,
            display: "flex",
            alignItems:
              "center",
            padding:
              "0 18px",
            gap: 18,
            flexShrink: 0
          }}
        >

          <button
            style={{
              border: "none",
              background:
                "transparent",
              color: sub,
              cursor:
                "pointer"
            }}
          >
            <Menu size={20} />
          </button>

          {/* SEARCH */}

          <form
            onSubmit={
              runSearch
            }
            style={{
              flex: 1,
              maxWidth: 720
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: 10,
                background:
                  darkMode
                    ? "#303134"
                    : "#f1f3f4",
                borderRadius: 10,
                padding:
                  "10px 14px"
              }}
            >
              <Search
                size={19}
                color={sub}
              />

              <input
                value={
                  searchTerm
                }
                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }
                placeholder="Search mail"
                style={{
                  border: "none",
                  outline: "none",
                  background:
                    "transparent",
                  fontSize: 14,
                  flex: 1,
                  color: ink
                }}
              />

              <ChevronDown
                size={17}
                color={sub}
              />
            </div>
          </form>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
            <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); }}
              style={{ border: `1px solid ${line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: darkMode ? "#303134" : "#fff", color: ink }}>
              <option value="">Any date</option>
              <option value="1">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <select value={unreadFilter ? "unread" : "all"} onChange={(e) => setUnreadFilter(e.target.value === "unread")}
              style={{ border: `1px solid ${line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: darkMode ? "#303134" : "#fff", color: ink }}>
              <option value="all">All mail</option>
              <option value="unread">Unread only</option>
            </select>
            <input value={senderFilter} onChange={(e) => setSenderFilter(e.target.value)} placeholder="From…"
              style={{ border: `1px solid ${line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, width: 110, background: darkMode ? "#303134" : "#fff", color: ink }} />
            <button onClick={applyFilters} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>Apply</button>
            {(dateFilter || unreadFilter || senderFilter) && (
              <button onClick={clearAllFilters} style={{ background: "transparent", border: "none", color: sub, fontSize: 13, cursor: "pointer" }}>Clear</button>
            )}
          </div>
          <div
            style={{
              marginLeft:
                "auto",
              display: "flex",
              alignItems:
                "center",
              gap: 10
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background:
                  "#1a73e8",
                color: "#fff",
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                fontWeight: 600,
                fontSize: 13
              }}
            >
              N
            </div>
          </div>
        </div>

        {/* CENTER CONTENT */}

        <div
          style={{
            flex: 1,
            display: "flex",
            minHeight: 0
          }}
        >

          {/* EMAIL LIST */}

          {view !==
            "compose" && (
            <div
              style={{
                width: openEmail
                  ? 470
                  : "100%",
                maxWidth:
                  openEmail
                    ? 470
                    : "none",
                background:
                  panel,
                borderRight:
                  openEmail
                    ? `1px solid ${line}`
                    : "none",
                display: "flex",
                flexDirection:
                  "column",
                minWidth: 0
              }}
            >

              {/* TOOLBAR */}

              <div
                style={{
                  height: 50,
                  borderBottom:
                    `1px solid ${line}`,
                  display: "flex",
                  alignItems:
                    "center",
                  gap: 8,
                  padding:
                    "0 12px"
                }}
              >
                <button
                  onClick={
                    toggleSelectAll
                  }
                  title="Select all"
                  style={toolbarButton(
                    ink
                  )}
                >
                  {selectedEmails.length === threadedList.length && threadedList.length > 0 ? (
                    <CheckSquare
                      size={18}
                    />
                  ) : (
                    <Square
                      size={18}
                    />
                  )}
                </button>

                {selectedEmails.length >
                  0 ? (
                  <>
                    <button
                      onClick={() =>
                        markSelected(
                          "read"
                        )
                      }
                      title="Mark as read"
                      style={toolbarButton(
                        ink
                      )}
                    >
                      <MailOpen
                        size={18}
                      />
                    </button>

                    <button
                      onClick={() =>
                        markSelected(
                          "unread"
                        )
                      }
                      title="Mark as unread"
                      style={toolbarButton(
                        ink
                      )}
                    >
                      <Mail
                        size={18}
                      />
                    </button>

                    <button
                      onClick={
                        archiveSelected
                      }
                      title="Archive"
                      style={toolbarButton(
                        ink
                      )}
                    >
                      <Archive
                        size={18}
                      />
                    </button>

                    <button
                      title="Delete"
                      onClick={deleteSelected}
                      style={toolbarButton(ink)}
                    >
                      <Trash2
                        size={18}
                      />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      title="Refresh"
                      onClick={() =>
                        loadEmails(
                          view
                        )
                      }
                      style={toolbarButton(
                        ink
                      )}
                    >
                      <RefreshCw
                        size={17}
                      />
                    </button>

                    <button
                      title="More"
                      style={toolbarButton(
                        ink
                      )}
                    >
                      <MoreHorizontal
                        size={18}
                      />
                    </button>
                  </>
                )}

                <div style={{ marginLeft: "auto", fontSize: 12, color: sub }}>
  {threadedList.length} {threadedList.length === 1 ? "conversation" : "conversations"}
</div>
              </div>

              {/* FOLDER TITLE */}

              <div
                style={{
                  padding:
                    "14px 16px",
                  borderBottom:
                    `1px solid ${line}`,
                  fontSize: 16,
                  fontWeight: 500
                }}
              >
                {view === "inbox" ? "Inbox"
                  : view == "sent" ? "Sent"
                  : view === "starred" ? "Starred"
                  : view ===  "drafts" ? "Drafts"
                  : view === "trash" ? "Trash" 
                  : "Archive"}

                {view ===
                  "inbox" &&
                  unreadCount >
                    0 && (
                    <span
                      style={{
                        color: sub,
                        fontSize: 12,
                        marginLeft: 7
                      }}
                    >
                      {unreadCount} unread
                    </span>
                  )}
              </div>

              {/* EMAILS */}

              <div
                style={{
                  overflowY:
                    "auto",
                  flex: 1
                }}
              >
                {threadedList.length === 0 && (
                  <div
                    style={{
                      padding: 40,
                      textAlign:
                        "center",
                      color: sub,
                      fontSize: 14
                    }}
                  >
                    No emails to show.
                  </div>
                )}

                {threadedList.map(
                  (e) => (
                    <EmailRow
                      key={e.id}
                      email={e}
                      selected={selectedEmails.includes(
                        e.id
                      )}
                      onSelect={
                        toggleSelect
                      }
                      onOpen={() =>
                        openEmailById(
                          e.id,
                          filter?.folder ||
                            view
                        )
                      }
                      onAction={
                        emailAction
                      }
                      folder={
                        filter?.folder ||
                        view
                      }
                      ink={ink}
                      sub={sub}
                      line={line}
                      hover={hover}
                      accent={accent}
                    />
                  )
                )}
                {!filter && hasMore && (
  <div
    style={{
      padding: 16,
      textAlign: "center"
    }}
  >
    <button
      onClick={() =>
        loadEmails(view, {}, true)
      }
      disabled={loading}
      style={{
        border: `1px solid ${line}`,
        background: panel,
        color: ink,
        borderRadius: 18,
        padding: "9px 18px",
        fontSize: 13,
        cursor: loading
          ? "default"
          : "pointer"
      }}
    >
      {loading ? "Loading..." : "Load More"}
    </button>
  </div>
)}
              </div>
            </div>
          )}

          {/* ==================================================
              READING PANEL
          ================================================== */}

          <div
            style={{
              flex: 1,
              minWidth: 0,
              background:
                panel,
              overflowY:
                "auto"
            }}
          >

            {/* COMPOSE */}

            {view ===
              "compose" && (
              <div
                style={{
                  padding:
                    "35px 50px",
                  maxWidth: 800
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: 12,
                    marginBottom:
                      25
                  }}
                >
                  <button
                    onClick={() =>
                      setView(
                        "inbox"
                      )
                    }
                    style={{
                      border:
                        "none",
                      background:
                        "transparent",
                      cursor:
                        "pointer",
                      color: sub
                    }}
                  >
                    <ArrowLeft
                      size={19}
                    />
                  </button>

                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 500
                    }}
                  >
                    New message
                  </div>
                </div>

                <LabeledRow
                  label="To"
                  sub={sub}
                >
                  <input
                    value={
                      draft.to
                    }
                    onChange={(
                      e
                    ) =>
                      setDraft(
                        (d) => ({
                          ...d,
                          to: e
                            .target
                            .value
                        })
                      )
                    }
                    placeholder="Recipients"
                    style={inputStyle(
                      line,
                      ink
                    )}
                  />
                </LabeledRow>

                <LabeledRow
                  label="Subject"
                  sub={sub}
                >
                  <input
                    value={
                      draft.subject
                    }
                    onChange={(
                      e
                    ) =>
                      setDraft(
                        (d) => ({
                          ...d,
                          subject:
                            e
                              .target
                              .value
                        })
                      )
                    }
                    placeholder="Subject"
                    style={inputStyle(
                      line,
                      ink
                    )}
                  />
                </LabeledRow>

                <textarea
                  value={
                    draft.body
                  }
                  onChange={(
                    e
                  ) =>
                    setDraft(
                      (d) => ({
                        ...d,
                        body: e
                          .target
                          .value
                      })
                    )
                  }
                  placeholder="Write your message..."
                  style={{
                    width:
                      "100%",
                    minHeight:
                      300,
                    border:
                      "none",
                    outline:
                      "none",
                    fontSize: 14,
                    marginTop:
                      20,
                    fontFamily:
                      "inherit",
                    resize:
                      "vertical",
                    background:
                      "transparent",
                    color: ink,
                    lineHeight:
                      1.6
                  }}
                />

                <div
                  style={{
                    display:
                      "flex",
                    gap: 10,
                    marginTop:
                      20
                  }}
                >
                  <button
                    onClick={() =>
                      setPendingSend(
                        true
                      )
                    }
                    disabled={
                      pendingSend
                    }
                    style={{
                      background:
                        "#1a73e8",
                      color:
                        "#fff",
                      border:
                        "none",
                      borderRadius:
                        18,
                      padding:
                        "10px 24px",
                      fontSize:
                        13,
                      fontWeight:
                        600,
                      cursor:
                        "pointer"
                    }}
                  >
                    Send
                  </button>

                  <button
                    onClick={() => {
                      setDraft({
                        to: "",
                        subject:
                          "",
                        body: ""
                      });

                      setView(
                        "inbox"
                      );
                    }}
                    style={{
                      background:
                        "transparent",
                      border:
                        `1px solid ${line}`,
                      color:
                        ink,
                      borderRadius:
                        18,
                      padding:
                        "10px 20px",
                      fontSize:
                        13,
                      cursor:
                        "pointer"
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* EMPTY */}

            {view !==
              "compose" &&
              !openEmail && (
                <div
                  style={{
                    height:
                      "100%",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    color: sub,
                    flexDirection:
                      "column",
                    gap: 12
                  }}
                >
                  <Mail
                    size={42}
                    strokeWidth={
                      1.2
                    }
                  />

                  <div
                    style={{
                      fontSize: 14
                    }}
                  >
                    Select an email
                    to read it
                  </div>
                </div>
              )}

            {/* OPEN EMAIL */}

            {view !==
              "compose" &&
              openEmail && (
                <div
                  style={{
                    padding:
                      "24px 38px",
                    maxWidth:
                      850
                  }}
                >

                  {/* TOP */}

                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 8,
                      marginBottom:
                        25
                    }}
                  >
                    <button
                      onClick={() =>
                        setOpenEmail(
                          null
                        )
                      }
                      style={{
                        border:
                          "none",
                        background:
                          "transparent",
                        color:
                          sub,
                        cursor:
                          "pointer"
                      }}
                    >
                      <ArrowLeft
                        size={20}
                      />
                    </button>

                    <button
                      onClick={() =>
                        emailAction(
                          openEmail.id,
                          openEmail.starred
                            ? "unstar"
                            : "star",
                          view
                        )
                      }
                      style={{
                        border:
                          "none",
                        background:
                          "transparent",
                        cursor:
                          "pointer",
                        color:
                          openEmail.starred
                            ? "#f4b400"
                            : sub
                      }}
                    >
                      <Star
                        size={19}
                        fill={
                          openEmail.starred
                            ? "#f4b400"
                            : "none"
                        }
                      />
                    </button>

                    <button
                      onClick={() =>
                        emailAction(
                          openEmail.id,
                          openEmail.read
                            ? "unread"
                            : "read",
                          view
                        )
                      }
                      style={{
                        border:
                          "none",
                        background:
                          "transparent",
                        cursor:
                          "pointer",
                        color:
                          sub
                      }}
                      title={
                        openEmail.read
                          ? "Mark as unread"
                          : "Mark as read"
                      }
                    >
                      {openEmail.read ? (
                        <Mail
                          size={19}
                        />
                      ) : (
                        <MailOpen
                          size={19}
                        />
                      )}
                    </button>

                    <button
                      onClick={() =>
                        emailAction(
                          openEmail.id,
                          "archive",
                          view
                        )
                      }
                      style={{
                        border:
                          "none",
                        background:
                          "transparent",
                        cursor:
                          "pointer",
                        color:
                          sub
                      }}
                    >
                      <Archive
                        size={19}
                      />
                    </button>
                  </div>

                  {/* SUBJECT */}

                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 400,
                      marginBottom:
                        20
                    }}
                  >
                    {
                      openEmail.subject
                    }
                  </div>

                  {/* SENDER */}

                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 12,
                      paddingBottom:
                        18,
                      borderBottom:
                        `1px solid ${line}`
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius:
                          "50%",
                        background:
                          "#5f6368",
                        color:
                          "#fff",
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        fontWeight:
                          600
                      }}
                    >
                      {nameOf(
                        openEmail.from
                      )
                        .charAt(
                          0
                        )
                        .toUpperCase()}
                    </div>

                    <div
                      style={{
                        flex: 1
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            14,
                          fontWeight:
                            600
                        }}
                      >
                        {nameOf(
                          openEmail.from
                        )}
                      </div>

                      <div
                        style={{
                          fontSize:
                            12,
                          color:
                            sub,
                          marginTop:
                            3
                        }}
                      >
                        {emailOf(
                          openEmail.from
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize:
                          12,
                        color:
                          sub
                      }}
                    >
                      {new Date(
                        openEmail.date
                      ).toLocaleString()}
                    </div>
                  </div>

                  {/* BODY */}

                  <div
                    style={{
                      fontSize:
                        14,
                      lineHeight:
                        1.7,
                      whiteSpace:
                        "pre-wrap",
                      padding:
                        "28px 10px"
                    }}
                  >
                    {
                      openEmail.body
                    }
                  </div>

                  {/* REPLY */}

                  <button
                    onClick={() =>
                      askAssistant(
                        `Reply to the email currently open ("${openEmail.subject}" from ${openEmail.from}).`
                      )
                    }
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 7,
                      background:
                        "transparent",
                      border:
                        `1px solid ${line}`,
                      color:
                        ink,
                      borderRadius:
                        18,
                      padding:
                        "9px 20px",
                      fontSize:
                        13,
                      cursor:
                        "pointer"
                    }}
                  >
                    <Reply
                      size={16}
                    />
                    Reply
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* ==================================================
          AI ASSISTANT
      ================================================== */}

      <div
        style={{
          width: 330,
          borderLeft:
            `1px solid ${line}`,
          display: "flex",
          flexDirection:
            "column",
          background:
            assistantBg,
          flexShrink: 0
        }}
      >

        {/* ASSISTANT HEADER */}

        <div
          style={{
            height: 64,
            display:
              "flex",
            alignItems:
              "center",
            gap: 10,
            padding:
              "0 16px",
            borderBottom:
              `1px solid ${line}`,
            background:
              headerBg
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius:
                "50%",
              background:
                "#1a73e8",
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center"
            }}
          >
            <Bot
              size={18}
              color="#fff"
            />
          </div>

          <div>
            <div
              style={{
                fontSize:
                  14,
                fontWeight:
                  600
              }}
            >
              MailPilot
            </div>

            <div
              style={{
                fontSize:
                  11,
                color:
                  sub
              }}
            >
              AI Mail Assistant
            </div>
          </div>

          <div
            style={{
              marginLeft:
                "auto",
              width: 8,
              height: 8,
              borderRadius:
                "50%",
              background:
                "#34a853"
            }}
          />
        </div>

        {/* CHAT */}

        <div
          style={{
            flex: 1,
            overflowY:
              "auto",
            padding:
              "16px 12px",
            display:
              "flex",
            flexDirection:
              "column",
            gap: 10
          }}
        >
          {chat.map((m, i) => (
  <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.45,
        padding: "9px 12px",
        borderRadius: 12,
        background: m.role === "user" ? "#1a73e8" : darkMode ? "#303134" : "#eef1f5",
        color: m.role === "user" ? "#fff" : ink
      }}
    >
      {m.text}
    </div>

    {/* RICH EMAIL PREVIEW */}
    {m.preview?.type === "filter_emails" && m.preview.results?.length > 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {m.preview.results.map((r) => (
          <div
            key={r.id}
            onClick={() => openEmailById(r.id, m.preview.folder)}
            style={{
              border: `1px solid ${line}`,
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
              background: darkMode ? "#292a2d" : "#fff"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(r.from)}
              </span>
              <span style={{ fontSize: 10.5, color: sub, flexShrink: 0 }}>{fmtDate(r.date)}</span>
            </div>
            <div style={{ fontSize: 12, color: ink, fontWeight: r.read ? 400 : 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.subject}
            </div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.preview}
            </div>
          </div>
        ))}
        
      </div>
    )}

    {m.preview?.type === "open_email" && m.preview.email && (
      <div
        onClick={() => openEmailById(m.preview.email.id, view)}
        style={{
          border: `1px solid ${line}`,
          borderRadius: 8,
          padding: "8px 10px",
          marginTop: 6,
          cursor: "pointer",
          background: darkMode ? "#292a2d" : "#fff"
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 12, color: ink }}>{nameOf(m.preview.email.from)}</div>
        <div style={{ fontSize: 12, color: ink, marginTop: 2 }}>{m.preview.email.subject}</div>
        <div style={{ fontSize: 11, color: sub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.preview.email.preview}
        </div>
      </div>
    )}
  </div>
))}

          {/* SEND CONFIRMATION */}

          {pendingSend && (
            <div
              style={{
                border:
                  "1px solid #dadce0",
                background:
                  darkMode
                    ? "#303134"
                    : "#fff",
                borderRadius:
                  10,
                padding: 12,
                fontSize:
                  12.5,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,.08)"
              }}
            >
              <div
                style={{
                  marginBottom:
                    10
                }}
              >
                Send this email
                to{" "}
                <strong>
                  {draft.to ||
                    "—"}
                </strong>
                ?
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: 8
                }}
              >
                <button
                  onClick={
                    confirmSend
                  }
                  style={{
                    flex: 1,
                    background:
                      "#1a73e8",
                    color:
                      "#fff",
                    border:
                      "none",
                    borderRadius:
                      18,
                    padding:
                      "7px 0",
                    fontSize:
                      12,
                    cursor:
                      "pointer"
                  }}
                >
                  Send
                </button>

                <button
                  onClick={
                    cancelSend
                  }
                  style={{
                    flex: 1,
                    background:
                      "transparent",
                    border:
                      `1px solid ${line}`,
                    color:
                      ink,
                    borderRadius:
                      18,
                    padding:
                      "7px 0",
                    fontSize:
                      12,
                    cursor:
                      "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {thinking && (
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: 7,
                color: sub,
                fontSize:
                  12.5
              }}
            >
              <Loader2
                size={14}
                style={{
                  animation:
                    "spin 1s linear infinite"
                }}
              />
              Thinking...
            </div>
          )}

          <div
            ref={
              chatEndRef
            }
          />
        </div>

        {/* CHAT INPUT */}

        <form
          onSubmit={
            handleChatSubmit
          }
          style={{
            display:
              "flex",
            gap: 7,
            padding: 12,
            borderTop:
              `1px solid ${line}`,
            background:
              headerBg
          }}
        >
          <input
            value={
              chatInput
            }
            onChange={(
              e
            ) =>
              setChatInput(
                e.target.value
              )
            }
            placeholder="Ask MailPilot...."
            style={{
              flex: 1,
              border:
                `1px solid ${line}`,
              borderRadius:
                20,
              padding:
                "9px 13px",
              fontSize:
                13,
              outline:
                "none",
              background:
                darkMode
                  ? "#303134"
                  : "#fff",
              color:
                ink
            }}
          />

          <button
            type="submit"
            disabled={
              thinking
            }
            style={{
              background:
                "#1a73e8",
              border:
                "none",
              borderRadius:
                "50%",
              width: 36,
              height: 36,
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              cursor:
                "pointer"
            }}
          >
            <Sparkles
              size={16}
              color="#fff"
            />
          </button>
        </form>
      </div>

      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          * {
            box-sizing: border-box;
          }

          ::-webkit-scrollbar {
            width: 8px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: #c7c7c7;
            border-radius: 10px;
          }

          button:hover {
            opacity: 0.9;
          }
        `}
      </style>
    </div>
  );
}

/* ======================================================
   EMAIL ROW
====================================================== */

function EmailRow({
  email,
  selected,
  onSelect,
  onOpen,
  onAction,
  folder,
  ink,
  sub,
  line,
  hover,
  accent
}) {
  const [isHover, setIsHover] =
    useState(false);

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() =>
        setIsHover(true)
      }
      onMouseLeave={() =>
        setIsHover(false)
      }
      style={{
        height: 66,
        display:
          "flex",
        alignItems:
          "center",
        gap: 8,
        padding:
          "0 12px",
        borderBottom:
          `1px solid ${line}`,
        background:
          selected
            ? "#e8f0fe"
            : isHover
            ? hover
            : "transparent",
        cursor:
          "pointer"
      }}
    >

      {/* CHECKBOX */}

      <button
        onClick={(e) =>
          onSelect(
            e,
            email.id
          )
        }
        style={{
          width: 28,
          height: 28,
          border: "none",
          background:
            "transparent",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          cursor:
            "pointer",
          color: sub,
          flexShrink: 0
        }}
      >
        {selected ? (
          <CheckSquare
            size={18}
            color={accent}
          />
        ) : (
          <Square
            size={18}
          />
        )}
      </button>

      {/* STAR */}

      <button
        onClick={(e) => {
          e.stopPropagation();

          onAction(
            email.id,
            email.starred
              ? "unstar"
              : "star",
            folder
          );
        }}
        title={
          email.starred
            ? "Unstar"
            : "Star"
        }
        style={{
          width: 28,
          height: 28,
          border: "none",
          background:
            "transparent",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          cursor:
            "pointer",
          color:
            email.starred
              ? "#f4b400"
              : sub,
          flexShrink: 0
        }}
      >
        <Star
          size={18}
          fill={
            email.starred
              ? "#f4b400"
              : "none"
          }
        />
      </button>

      {/* SENDER */}

      <div
        style={{
          width: 165,
          flexShrink: 0,
          fontSize: 13,
          fontWeight:
            email.read
              ? 400
              : 700,
          whiteSpace:
            "nowrap",
          overflow:
            "hidden",
          textOverflow:
            "ellipsis"
        }}
      >
        {folder ===
        "sent"
          ? email.to
          : nameOf(
              email.from
            )}
      </div>

      {/* SUBJECT + PREVIEW */}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display:
            "flex",
          alignItems:
            "center",
          gap: 5,
          fontSize: 13
        }}
      >
        <span
          style={{
            fontWeight:
              email.read
                ? 400
                : 700,
            whiteSpace:
              "nowrap",
            overflow:
              "hidden",
            textOverflow:
              "ellipsis"
          }}
        >
          {email.subject}
        </span>
        {email.threadCount > 1 && (
  <span
    style={{
      fontSize: 11,
      color: sub,
      fontWeight: 600,
      flexShrink: 0
    }}
  >
    ({email.threadCount})
  </span>
)}
        <span
          style={{
            color: sub,
            whiteSpace:
              "nowrap",
            overflow:
              "hidden",
            textOverflow:
              "ellipsis"
          }}
        >
          {" "}
          - {email.preview}
        </span>
      </div>

      {/* HOVER ACTIONS */}

      {isHover ? (
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap: 2
          }}
        >
          <RowAction
            title={
              email.read
                ? "Mark as unread"
                : "Mark as read"
            }
            onClick={(e) => {
              e.stopPropagation();

              onAction(
                email.id,
                email.read
                  ? "unread"
                  : "read",
                folder
              );
            }}
          >
            {email.read ? (
              <Mail size={16} />
            ) : (
              <MailOpen
                size={16}
              />
            )}
          </RowAction>

          <RowAction
            title="Archive"
            onClick={(e) => {
              e.stopPropagation();

              onAction(
                email.id,
                "archive",
                folder
              );
            }}
          >
            <Archive
              size={16}
            />
          </RowAction>

          <RowAction
            title="More"
            onClick={(e) => {
              e.stopPropagation();

              // Future menu
            }}
          >
            <MoreHorizontal
              size={16}
            />
          </RowAction>
        </div>
      ) : (
        <div
          style={{
            width: 70,
            textAlign:
              "right",
            fontSize: 11.5,
            color: sub,
            flexShrink: 0
          }}
        >
          {fmtDate(
            email.date
          )}
        </div>
      )}
    </div>
  );
}

/* ======================================================
   ROW ACTION
====================================================== */

function RowAction({
  children,
  title,
  onClick
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        border: "none",
        background:
          "transparent",
        color: "#5f6368",
        display:
          "flex",
        alignItems:
          "center",
        justifyContent:
          "center",
        cursor:
          "pointer",
        borderRadius: "50%"
      }}
    >
      {children}
    </button>
  );
}

/* ======================================================
   NAV ITEM
====================================================== */

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  accent,
  selected,
  ink
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display:
          "flex",
        alignItems:
          "center",
        gap: 13,
        padding:
          "10px 14px",
        margin:
          "1px 0",
        borderRadius:
          "0 18px 18px 0",
        border: "none",
        background:
          active
            ? selected
            : "transparent",
        cursor:
          "pointer",
        fontSize: 14,
        color:
          active
            ? ink
            : ink,
        fontWeight:
          active
            ? 600
            : 400,
        textAlign:
          "left",
        width: "100%"
      }}
    >
      {icon}

      <span
        style={{
          flex: 1
        }}
      >
        {label}
      </span>

      {count > 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ======================================================
   LABELED ROW
====================================================== */

function LabeledRow({
  label,
  children,
  sub
}) {
  return (
    <div
      style={{
        display:
          "flex",
        alignItems:
          "center",
        gap: 14,
        borderBottom:
          `1px solid ${sub}40`
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: sub,
          width: 60
        }}
      >
        {label}
      </div>

      <div
        style={{
          flex: 1
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ======================================================
   INPUT STYLE
====================================================== */

function inputStyle(
  line,
  ink
) {
  return {
    width: "100%",
    border: "none",
    borderBottom:
      `1px solid ${line}`,
    padding:
      "12px 0",
    fontSize: 14,
    outline: "none",
    background:
      "transparent",
    color: ink
  };
}

/* ======================================================
   TOOLBAR BUTTON
====================================================== */

function toolbarButton(
  color
) {
  return {
    width: 34,
    height: 34,
    border: "none",
    background:
      "transparent",
    color,
    borderRadius: "50%",
    display: "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    cursor: "pointer"
  };
}
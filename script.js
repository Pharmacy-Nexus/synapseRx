const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("messageInput");
const newChatBtn = document.getElementById("newChatBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");

let conversation = [];

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

inputEl.addEventListener("input", () => autoGrow(inputEl));

function formatAssistantText(text) {
  let safe = escapeHtml(text);

  const headings = [
    "Case Summary",
    "Clinical Assessment",
    "Drug Related Problems",
    "Missing Information",
    "Recommendations",
    "Patient Counseling",
    "Confidence Level",
    "Overview",
    "Mechanism",
    "Main Uses",
    "Key Warnings",
    "Monitoring",
    "Interaction Summary",
    "Report",
    "Summary"
  ];

  headings.forEach((heading) => {
    const regex = new RegExp(heading, "g");
    safe = safe.replace(regex, `<span class="section-title">${heading}</span>`);
  });

  safe = safe.replace(/\n/g, "<br>");
  return safe;
}

function botAvatarHtml() {
  return `
    <div class="medical-bot">
      <div class="bot-head">
        <div class="bot-screen">
          <span class="eye left"></span>
          <span class="eye right"></span>
          <span class="mouth"></span>
        </div>
      </div>
      <div class="bot-body"></div>
      <span class="bot-badge">+</span>
    </div>
  `;
}

function userAvatarHtml() {
  return `<div class="avatar-user">YOU</div>`;
}

function appendMessage(role, content, options = {}) {
  const { isHtml = false, loading = false, mode = "" } = options;

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = role === "assistant" ? botAvatarHtml() : userAvatarHtml();

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (loading) {
    bubble.innerHTML = `
      <div class="typing">
        <span></span><span></span><span></span>
      </div>
    `;
  } else {
    const modeChip = mode
      ? `<div class="mode-chip">${mode.replace(/_/g, " ")}</div>`
      : "";

    bubble.innerHTML = isHtml
      ? `${modeChip}${content}`
      : `${modeChip}${escapeHtml(content).replace(/\n/g, "<br>")}`;
  }

  row.innerHTML = avatar;
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return { row, bubble };
}

function addWelcomeMessage() {
  const welcome = `
    <span class="section-title">Welcome</span>
    I can automatically detect what you need:
    <br>- Drug Information
    <br>- Drug Safety / Interactions
    <br>- Case Analysis
    <br>- Report / PDF preparation
    <br>- General Pharmacist Chat
    <br><br>
    Try:
    <br><strong>"Explain metformin"</strong>
    <br><strong>"Warfarin with amiodarone?"</strong>
    <br><strong>"65-year-old male with HTN on ramipril and potassium, K=5.8"</strong>
  `;
  appendMessage("assistant", welcome, { isHtml: true, mode: "general_chat" });
  conversation.push({
    role: "assistant",
    content: "Welcome message",
  });
}

function resetChat() {
  messagesEl.innerHTML = "";
  conversation = [];
  addWelcomeMessage();
}

newChatBtn.addEventListener("click", resetChat);

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userText = inputEl.value.trim();
  if (!userText) return;

  appendMessage("user", userText);
  conversation.push({ role: "user", content: userText });

  inputEl.value = "";
  autoGrow(inputEl);

  const loadingMessage = appendMessage("assistant", "", { loading: true });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversation
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    const formatted = formatAssistantText(data.reply || "No response.");
    loadingMessage.bubble.innerHTML = `
      <div class="mode-chip">${(data.mode || "general_chat").replace(/_/g, " ")}</div>
      ${formatted}
    `;

    conversation.push({
      role: "assistant",
      content: data.reply || "No response."
    });
  } catch (error) {
    loadingMessage.bubble.innerHTML = `
      <span class="section-title">Error</span>
      ${escapeHtml(error.message || "Failed to connect to AI.")}
    `;

    conversation.push({
      role: "assistant",
      content: `Error: ${error.message || "Failed to connect to AI."}`
    });
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
});

exportPdfBtn.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 16;
  doc.setFontSize(16);
  doc.text("Nexus Clinical Pharmacist AI", 14, y);
  y += 10;

  doc.setFontSize(10);
  doc.text(`Exported on: ${new Date().toLocaleString()}`, 14, y);
  y += 10;

  conversation.forEach((msg, index) => {
    const title = msg.role === "user" ? "User" : "Assistant";
    const lines = doc.splitTextToSize(`${title}: ${msg.content}`, 180);

    if (y + lines.length * 6 > 280) {
      doc.addPage();
      y = 16;
    }

    doc.setFontSize(11);
    doc.text(lines, 14, y);
    y += lines.length * 6 + 6;
  });

  doc.save("nexus-chat.pdf");
});

resetChat();

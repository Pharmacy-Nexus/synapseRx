const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("messageInput");
const newChatBtn = document.getElementById("newChatBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const commandPalette = document.getElementById("commandPalette");
const pdfModal = document.getElementById("pdfModal");
const pdfEditor = document.getElementById("pdfEditor");
const closePdfModal = document.getElementById("closePdfModal");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

// لو الواجهة على GitHub Pages والـ API على Vercel، حط لينك Vercel الكامل هنا.
// مثال: const API_ENDPOINT = "https://your-vercel-app.vercel.app/api/chat";
const API_ENDPOINT = window.NEXUS_API_ENDPOINT || "/api/chat";

let conversation = [];

function escapeHtml(text = "") {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 170) + "px";
}
inputEl.addEventListener("input", () => {
  autoGrow(inputEl);
  if (inputEl.value.includes("@")) commandPalette.classList.remove("hidden");
});
inputEl.addEventListener("focus", () => {
  if (inputEl.value.includes("@")) commandPalette.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!commandPalette.contains(e.target) && e.target !== inputEl) commandPalette.classList.add("hidden");
});

function normalizeCommand(text) {
  return text
    .replace(/^\/قارن\s+/i, "@compare ")
    .replace(/^\/عكس\s+/i, "@reverse ")
    .replace(/^\/تقرير\s*/i, "@report ");
}

function formatAssistantText(text) {
  let safe = escapeHtml(text);
  const headings = [
    "Case Summary", "Clinical Assessment", "Drug Related Problems", "Missing Information",
    "Recommendations", "Patient Counseling", "Confidence Level", "Overview", "Mechanism",
    "Main Uses", "Key Warnings", "Monitoring", "Interaction Summary", "Report", "Summary",
    "موجود", "ناقص", "اقتراحات", "الخلاصة", "التقييم", "التوصيات", "التحذيرات"
  ];
  headings.forEach((heading) => {
    const regex = new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    safe = safe.replace(regex, `<span class="section-title">${heading}</span>`);
  });
  return safe.replace(/\n/g, "<br>");
}

function addDisclaimer(bubble) {
  const note = document.createElement("div");
  note.className = "disclaimer";
  note.innerHTML = `<span class="scale" title="هذا الرد للأغراض التعليمية فقط – راجع الصيدلي السريري قبل التطبيق">⚖</span> Educational decision support only.`;
  bubble.appendChild(note);
}

function appendMessage(role, content, options = {}) {
  const { isHtml = false, mode = "", validation = false } = options;
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? "Nx" : "You";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (validation) {
    bubble.innerHTML = `<div class="validation-box"><span class="spinner"></span><span>جاري التحقق من التداخلات الدوائية والجرعات...</span></div>`;
  } else {
    const chip = mode ? `<div class="mode-chip">@${mode.replace(/_/g, "-")}</div>` : "";
    bubble.innerHTML = isHtml ? `${chip}${content}` : `${chip}${escapeHtml(content).replace(/\n/g, "<br>")}`;
    if (role === "assistant") addDisclaimer(bubble);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { row, bubble };
}

function addWelcomeMessage() {
  const welcome = `
    <div class="welcome-center">
      <div class="welcome-mark">Nx</div>
      <h1>How can I help?</h1>
      <p>اكتب سؤالك بشكل طبيعي. Nexus سيحدد نوع المهمة تلقائيًا: معلومات دواء، تداخلات، تحليل حالة، مقارنة، أو تقرير.</p>
      <div class="prompt-grid">
        <button class="prompt-card" data-prompt="@compare ramipril losartan"><b>@compare</b><span>مقارنة دوائين</span></button>
        <button class="prompt-card" data-prompt="@reverse alfuzosin"><b>@reverse</b><span>عكس سيناريو تعليمي</span></button>
        <button class="prompt-card" data-prompt="مريض 65 سنة على ramipril"><b>@case</b><span>تحليل حالة ناقصة</span></button>
        <button class="prompt-card" data-prompt="Warfarin with amiodarone?"><b>@safety</b><span>فحص تداخل دوائي</span></button>
      </div>
    </div>
  `;
  const holder = document.createElement("div");
  holder.innerHTML = welcome;
  messagesEl.appendChild(holder.firstElementChild);
}

function resetChat() {
  messagesEl.innerHTML = "";
  conversation = [];
  addWelcomeMessage();
}

newChatBtn.addEventListener("click", resetChat);

document.addEventListener("click", (e) => {
  const promptBtn = e.target.closest("[data-prompt]");
  if (promptBtn) {
    inputEl.value = promptBtn.dataset.prompt;
    inputEl.focus();
    autoGrow(inputEl);
  }
  const cmdBtn = e.target.closest("[data-command]");
  if (cmdBtn && !promptBtn) {
    inputEl.value = cmdBtn.dataset.command + inputEl.value.replace("@", "");
    inputEl.focus();
    commandPalette.classList.add("hidden");
    autoGrow(inputEl);
  }
  const smartBtn = e.target.closest("[data-smart]");
  if (smartBtn) {
    inputEl.value = smartBtn.dataset.smart;
    inputEl.focus();
    autoGrow(inputEl);
  }
});

function smartButtonsHtml() {
  return `
    <div class="smart-actions">
      <button data-smart="أضف K و serum creatinine و eGFR للحالة السابقة">أضف التحاليل</button>
      <button data-smart="اسأل المريض عن الدوخة، الإغماء، الخفقان، وأدوية الضغط الأخرى">أسئلة متابعة</button>
      <button data-smart="حوّل آخر رد إلى تقرير مختصر قابل للطباعة">تجهيز تقرير</button>
    </div>
  `;
}

async function safeJsonResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch {
    if (text.trim().startsWith("<")) {
      throw new Error("الـ API غير شغال هنا. أنت غالبًا فاتح الموقع من GitHub Pages؛ لازم تستخدم Vercel للـ /api أو تحط رابط Vercel الكامل في API_ENDPOINT.");
    }
    throw new Error(text.slice(0, 180) || "Invalid server response");
  }
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userText = normalizeCommand(inputEl.value.trim());
  if (!userText) return;

  const welcome = document.querySelector(".welcome-center");
  if (welcome) welcome.remove();

  appendMessage("user", userText);
  conversation.push({ role: "user", content: userText });
  inputEl.value = "";
  autoGrow(inputEl);
  commandPalette.classList.add("hidden");

  const loadingMessage = appendMessage("assistant", "", { validation: true });

  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation })
    });
    const data = await safeJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "AI request failed.");

    const formatted = formatAssistantText(data.reply || "No response.");
    loadingMessage.bubble.innerHTML = `<div class="mode-chip">@${(data.mode || "general-chat").replace(/_/g, "-")}</div>${formatted}`;
    if ((data.mode || "").includes("case") || /ناقص|missing/i.test(data.reply || "")) {
      loadingMessage.bubble.innerHTML += smartButtonsHtml();
    }
    addDisclaimer(loadingMessage.bubble);
    conversation.push({ role: "assistant", content: data.reply || "No response." });
  } catch (error) {
    loadingMessage.bubble.innerHTML = `<span class="section-title">Connection error</span>${escapeHtml(error.message)}`;
    conversation.push({ role: "assistant", content: `Error: ${error.message}` });
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
});

function buildReportText() {
  return conversation.map((msg) => `${msg.role === "user" ? "User" : "Nexus"}:\n${msg.content}`).join("\n\n---\n\n");
}

exportPdfBtn.addEventListener("click", () => {
  pdfEditor.value = buildReportText();
  pdfModal.classList.remove("hidden");
});
closePdfModal.addEventListener("click", () => pdfModal.classList.add("hidden"));

downloadPdfBtn.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const text = pdfEditor.value || buildReportText();
  let y = 16;
  doc.setFontSize(15);
  doc.text("Nexus Clinical Pharmacist Report", 14, y);
  y += 10;
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 10;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, 180);
  lines.forEach((line) => {
    if (y > 280) { doc.addPage(); y = 16; }
    doc.text(line, 14, y);
    y += 5.5;
  });
  doc.save("nexus-report.pdf");
  pdfModal.classList.add("hidden");
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && document.activeElement === inputEl) {
    formEl.dispatchEvent(new Event("submit"));
  }
  if (e.key === "Escape") commandPalette.classList.add("hidden");
});

resetChat();

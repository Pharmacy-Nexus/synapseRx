import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const API_ENDPOINT = window.NEXUS_API_ENDPOINT || "/api/chat";
const SUPABASE_URL = window.NEXUS_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.NEXUS_SUPABASE_ANON_KEY || "";
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = HAS_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const MODE_META = {
  general_chat: {
    label: "General Chat",
    prompt: "Answer like a normal medical/pharmacy chat. Do not force case-analysis headings unless the user explicitly asks for a case, interaction check, or structured clinical assessment."
  },
  case_analysis: {
    label: "Case Analysis",
    prompt: "Analyze this case as a clinical pharmacist. Focus on medication-related problems, missing labs, monitoring, red flags, and practical recommendations."
  },
  drug_interaction: {
    label: "Drug Interaction",
    prompt: "Check this medication combination for interactions, contraindications, severity, mechanism, monitoring, and safer alternatives."
  },
  drug_reverse: {
    label: "Drug Reverse",
    prompt: "Run an interactive training scenario. Ask me to infer the drug, interaction, or medication problem from clues, then correct me step by step."
  }
};

const els = {
  authPage: document.getElementById("authPage"),
  appRoot: document.getElementById("appRoot"),
  authForm: document.getElementById("authForm"),
  loginTab: document.getElementById("loginTab"),
  signupTab: document.getElementById("signupTab"),
  authTitle: document.getElementById("authTitle"),
  authSubtitle: document.getElementById("authSubtitle"),
  nameField: document.getElementById("nameField"),
  nameInput: document.getElementById("nameInput"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authMessage: document.getElementById("authMessage"),
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  openSidebarBtn: document.getElementById("openSidebarBtn"),
  closeSidebarBtn: document.getElementById("closeSidebarBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  chatHistory: document.getElementById("chatHistory"),
  toggleArchiveBtn: document.getElementById("toggleArchiveBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeIcon: document.getElementById("themeIcon"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  logoutBtn: document.getElementById("logoutBtn"),
  activeModePill: document.getElementById("activeModePill"),
  conversationTitle: document.getElementById("conversationTitle"),
  messages: document.getElementById("messages"),
  messagesInner: document.getElementById("messagesInner"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  stopBtn: document.getElementById("stopBtn"),
  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  attachedFiles: document.getElementById("attachedFiles"),
  newChatTopBtn: document.getElementById("newChatTopBtn"),
  modeSwitcher: document.getElementById("modeSwitcher"),
  toast: document.getElementById("toast"),
  safetyPanel: document.getElementById("safetyPanel"),
  safetyContent: document.getElementById("safetyContent"),
  closeSafetyPanel: document.getElementById("closeSafetyPanel")
};

let state = {
  authMode: "login",
  user: null,
  activeMode: "general_chat",
  conversations: [],
  currentConversationId: null,
  showArchived: false,
  pendingFiles: [],
  abortController: null,
  isGenerating: false,
  readOnlyShare: false,
  dropdown: null,
  editingMessageIndex: null
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2500);
}

function setAuthMessage(message, isError = false) {
  els.authMessage.textContent = message || "";
  els.authMessage.style.color = isError ? "var(--danger)" : "var(--text-tertiary)";
}

function localUserKey() { return "nexus_local_user"; }
function localConversationsKey() { return `nexus_conversations_${state.user?.id || "guest"}`; }
function localSharesKey() { return "nexus_local_shares"; }

function getLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function setLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isShortGreetingText(text = "") {
  const t = String(text || "").trim().toLowerCase();
  return /^(hi|hello|hey|السلام عليكم|اهلا|أهلا|ازيك|عامل ايه|هاي|هلا|صباح الخير|مساء الخير)[!.؟\s]*$/.test(t);
}

function localGreetingReply() {
  return "Hi 👋 I'm Nexus. How can I help?";
}

function normalizeConversation(row) {
  return {
    id: row.id,
    user_id: row.user_id || state.user?.id || "local",
    title: row.title || "New chat",
    mode: row.mode || "general_chat",
    messages: Array.isArray(row.messages) ? row.messages : [],
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso()
  };
}

function currentConversation() {
  return state.conversations.find(c => c.id === state.currentConversationId) || null;
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isSignup = mode === "signup";
  els.loginTab.classList.toggle("active", !isSignup);
  els.signupTab.classList.toggle("active", isSignup);
  els.nameField.classList.toggle("hidden", !isSignup);
  els.nameInput.required = isSignup;
  els.authTitle.textContent = isSignup ? "Create account" : "Welcome back";
  els.authSubtitle.textContent = isSignup ? "Start a secure clinical workspace." : "Login to continue your clinical workspace.";
  els.authSubmitBtn.textContent = isSignup ? "Create account" : "Login";
  els.passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  setAuthMessage("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  const fullName = els.nameInput.value.trim() || email.split("@")[0];
  setAuthMessage("Working…");
  els.authSubmitBtn.disabled = true;

  try {
    if (HAS_SUPABASE) {
      if (state.authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage("Account created. Check your email if confirmation is enabled.");
          return;
        }
        await enterApp(data.user || data.session.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await enterApp(data.user || data.session.user);
      }
    } else {
      const user = { id: "local_user", email, user_metadata: { full_name: fullName } };
      setLocalJson(localUserKey(), user);
      await enterApp(user);
    }
  } catch (error) {
    setAuthMessage(error.message || "Authentication failed.", true);
  } finally {
    els.authSubmitBtn.disabled = false;
  }
}

function showAuth() {
  document.body.classList.remove("app-active", "generating");
  els.authPage.classList.remove("hidden");
  els.appRoot.classList.add("hidden");
}

async function enterApp(user, options = {}) {
  document.body.classList.add("app-active");
  state.user = user;
  state.readOnlyShare = Boolean(options.readOnlyShare);
  els.authPage.classList.add("hidden");
  els.appRoot.classList.remove("hidden");
  updateUserCard();
  applyTheme(localStorage.getItem("nexus_theme") || "light");

  if (state.readOnlyShare) {
    renderHistory();
    renderCurrentConversation();
    setComposerDisabled(true);
    return;
  }

  setComposerDisabled(false);
  await loadConversations();
  if (!state.conversations.length) {
    await createNewConversation(false);
  } else {
    state.currentConversationId = state.conversations[0].id;
    selectMode(state.conversations[0].mode || "general_chat", false);
    renderAll();
  }
}

function updateUserCard() {
  const name = state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "User";
  const email = state.user?.email || (state.readOnlyShare ? "Shared conversation" : "Local demo");
  els.userName.textContent = name;
  els.userEmail.textContent = email;
  els.userAvatar.textContent = name.slice(0, 1).toUpperCase();
}

async function logout() {
  if (HAS_SUPABASE && !state.readOnlyShare) {
    await supabase.auth.signOut();
  } else {
    localStorage.removeItem(localUserKey());
  }
  state.user = null;
  state.conversations = [];
  state.currentConversationId = null;
  state.readOnlyShare = false;
  showAuth();
}

async function loadConversations() {
  if (!state.user) return;

  if (HAS_SUPABASE) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("archived", state.showArchived)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) {
      showToast("Supabase tables not ready. Check README SQL.");
      console.error(error);
      state.conversations = [];
      return;
    }
    state.conversations = (data || []).map(normalizeConversation);
  } else {
    state.conversations = getLocalJson(localConversationsKey(), [])
      .map(normalizeConversation)
      .filter(c => c.archived === state.showArchived)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at));
  }
}

async function persistConversation(conversation, patch = {}) {
  const updated = normalizeConversation({ ...conversation, ...patch, updated_at: nowIso() });

  if (HAS_SUPABASE && !state.readOnlyShare) {
    const { data, error } = await supabase
      .from("conversations")
      .update({
        title: updated.title,
        mode: updated.mode,
        messages: updated.messages,
        pinned: updated.pinned,
        archived: updated.archived,
        updated_at: updated.updated_at
      })
      .eq("id", updated.id)
      .select()
      .single();
    if (error) throw error;
    replaceConversation(normalizeConversation(data));
  } else {
    const all = getLocalJson(localConversationsKey(), []);
    const index = all.findIndex(c => c.id === updated.id);
    if (index >= 0) all[index] = updated;
    else all.push(updated);
    setLocalJson(localConversationsKey(), all);
    replaceConversation(updated);
  }

  renderAll();
}

function replaceConversation(conversation) {
  const visible = conversation.archived === state.showArchived;
  const index = state.conversations.findIndex(c => c.id === conversation.id);
  if (visible) {
    if (index >= 0) state.conversations[index] = conversation;
    else state.conversations.unshift(conversation);
  } else if (index >= 0) {
    state.conversations.splice(index, 1);
  }
  state.conversations.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at));
}

async function createNewConversation(render = true) {
  const conversation = normalizeConversation({
    id: uid("chat"),
    user_id: state.user?.id || "local",
    title: "",
    mode: state.activeMode || "general_chat",
    messages: [],
    pinned: false,
    archived: false,
    created_at: nowIso(),
    updated_at: nowIso()
  });

  if (HAS_SUPABASE && !state.readOnlyShare) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: state.user.id,
        title: conversation.title || "New chat",
        mode: conversation.mode,
        messages: conversation.messages,
        pinned: false,
        archived: false
      })
      .select()
      .single();
    if (error) {
      showToast("Could not create chat. Check Supabase table/RLS.");
      console.error(error);
      return;
    }
    state.conversations.unshift(normalizeConversation(data));
    state.currentConversationId = data.id;
  } else {
    const all = getLocalJson(localConversationsKey(), []);
    all.unshift(conversation);
    setLocalJson(localConversationsKey(), all);
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
  }

  const selected = currentConversation();
  selectMode(selected?.mode || state.activeMode, false);
  if (render) {
    renderAll();
    closeSidebarMobile();
    setTimeout(() => els.messageInput.focus(), 50);
  }
}

async function deleteConversation(conversation) {
  if (!conversation) return;
  if (!confirm("Delete this conversation permanently?")) return;

  if (HAS_SUPABASE && !state.readOnlyShare) {
    const { error } = await supabase.from("conversations").delete().eq("id", conversation.id);
    if (error) return showToast(error.message);
  } else {
    const all = getLocalJson(localConversationsKey(), []).filter(c => c.id !== conversation.id);
    setLocalJson(localConversationsKey(), all);
  }

  state.conversations = state.conversations.filter(c => c.id !== conversation.id);
  if (state.currentConversationId === conversation.id) {
    if (state.conversations[0]) state.currentConversationId = state.conversations[0].id;
    else await createNewConversation(false);
  }
  renderAll();
}

function selectMode(mode, persist = true) {
  state.activeMode = MODE_META[mode] ? mode : "general_chat";
  document.body.dataset.mode = state.activeMode;
  document.querySelectorAll(".mode-chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.activeMode);
  });
  els.activeModePill.textContent = MODE_META[state.activeMode]?.label || MODE_META.general_chat.label;

  const conversation = currentConversation();
  if (conversation && persist && !state.readOnlyShare) {
    persistConversation(conversation, { mode: state.activeMode }).catch(err => showToast(err.message));
  }
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = safeTheme;
  localStorage.setItem("nexus_theme", safeTheme);
  els.themeIcon.textContent = safeTheme === "dark" ? "☀" : "☾";
}

function renderAll() {
  renderHistory();
  renderCurrentConversation();
}

function renderHistory() {
  els.chatHistory.innerHTML = "";
  els.toggleArchiveBtn.classList.toggle("active", state.showArchived);

  if (state.readOnlyShare) {
    els.chatHistory.innerHTML = `<div class="empty-state">Shared read-only conversation.</div>`;
    return;
  }

  if (!state.conversations.length) {
    els.chatHistory.innerHTML = `<div class="empty-state">No ${state.showArchived ? "archived" : "active"} chats yet.</div>`;
    return;
  }

  const groups = groupConversationsByDate(state.conversations);
  for (const [label, items] of groups) {
    const groupNode = document.createElement("div");
    groupNode.className = "history-group";
    groupNode.innerHTML = `<div class="history-group-title">${escapeHtml(label)}</div>`;
    items.forEach(conversation => {
      const row = document.createElement("div");
      row.className = "history-item-wrapper";
      const displayTitle = conversation.title || makeTitle(conversation.messages?.find(m => m.role === "user")?.content || "New chat");
      row.innerHTML = `
        <button class="history-item ${conversation.id === state.currentConversationId ? "active" : ""}" type="button" title="${escapeHtml(displayTitle)}">
          <span class="history-item-title">${conversation.pinned ? "📌 " : ""}${escapeHtml(displayTitle)}</span>
        </button>
        <button class="history-actions" type="button" aria-label="Conversation actions">•••</button>
      `;
      row.querySelector(".history-item").addEventListener("click", () => {
        state.currentConversationId = conversation.id;
        selectMode(conversation.mode || "general_chat", false);
        renderAll();
        closeSidebarMobile();
      });
      row.querySelector(".history-actions").addEventListener("click", (event) => openConversationMenu(event, conversation));
      groupNode.appendChild(row);
    });
    els.chatHistory.appendChild(groupNode);
  }
}

function groupConversationsByDate(conversations = []) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const buckets = new Map([["Today", []], ["Yesterday", []], ["Previous", []]]);
  conversations.forEach(conversation => {
    const date = new Date(conversation.updated_at || conversation.created_at || Date.now());
    const label = date >= startToday ? "Today" : date >= startYesterday ? "Yesterday" : "Previous";
    buckets.get(label).push(conversation);
  });
  return Array.from(buckets.entries()).filter(([, items]) => items.length);
}

function renderCurrentConversation() {
  const conversation = currentConversation();
  els.messagesInner.innerHTML = "";

  if (!conversation) {
    els.messagesInner.appendChild(welcomeNode());
    return;
  }

  els.conversationTitle.textContent = conversation.title || "New chat";
  els.activeModePill.textContent = MODE_META[conversation.mode]?.label || MODE_META[state.activeMode]?.label || MODE_META.general_chat.label;

  if (!conversation.messages.length) {
    els.messagesInner.appendChild(welcomeNode());
  } else {
    conversation.messages.forEach((message, index) => {
      els.messagesInner.appendChild(createMessageNode(message.role, message.content, {
        mode: message.mode,
        thinkingTime: message.thinkingTime,
        attachments: message.attachments || [],
        hideSuggestions: message.hideSuggestions,
        hideDisclaimer: message.hideDisclaimer,
        local: message.local,
        index
      }));
    });
  }

  scrollToBottom(true);
}

function welcomeNode() {
  const node = document.createElement("div");
  node.className = "welcome-screen";
  node.innerHTML = `
    <div class="welcome-icon">Nx</div>
    <h2 class="welcome-title">How can I help today?</h2>
    <p class="welcome-subtitle">
      Analyze cases, check drug interactions, or train with reverse scenarios. 
      All responses include clinical safety context.
    </p>
    <div class="welcome-prompts">
      <button class="prompt-card" data-prompt="65-year-old male on ramipril + potassium supplement. No recent K or SCr. Analyze the risk.">
        <div class="prompt-card-icon">📋</div>
        <div class="prompt-card-title">Case Analysis</div>
        <div class="prompt-card-desc">Analyze a patient case with missing information and red flags.</div>
      </button>
      <button class="prompt-card" data-prompt="Check interaction: warfarin with amiodarone. Include mechanism, monitoring, and action plan.">
        <div class="prompt-card-icon">⚡</div>
        <div class="prompt-card-title">Drug Interaction</div>
        <div class="prompt-card-desc">Safety check with severity, mechanism, and monitoring.</div>
      </button>
      <button class="prompt-card" data-prompt="Explain the difference between ACE inhibitors and ARBs briefly.">
        <div class="prompt-card-icon">💬</div>
        <div class="prompt-card-title">General Chat</div>
        <div class="prompt-card-desc">Normal clinical chat without forcing a tool.</div>
      </button>
      <button class="prompt-card" data-prompt="Start Drug Reverse training for ACE inhibitors and hyperkalemia risk.">
        <div class="prompt-card-icon">🎯</div>
        <div class="prompt-card-title">Drug Reverse</div>
        <div class="prompt-card-desc">Interactive training with clues and step-by-step correction.</div>
      </button>
    </div>
  `;
  node.querySelectorAll("[data-prompt]").forEach(btn => {
    btn.addEventListener("click", () => {
      els.messageInput.value = btn.dataset.prompt;
      autoGrow(els.messageInput);
      els.messageInput.focus();
    });
  });
  return node;
}

function createMessageNode(role, content, options = {}) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  if (Number.isInteger(options.index)) row.dataset.messageIndex = String(options.index);

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "assistant" ? "Nx" : "You";

  const wrapper = document.createElement("div");
  wrapper.className = "message-content-wrapper";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const cleanContent = role === "assistant" ? cleanAssistantVisibleContent(content) : content;
  bubble.innerHTML = role === "assistant" 
    ? renderMarkdown(cleanContent) 
    : escapeHtml(content).replace(/\n/g, "<br>");

  if (options.attachments?.length && role === "user") {
    const chips = document.createElement("div");
    chips.className = "attachment-chips";
    options.attachments.forEach(file => {
      const chip = document.createElement("span");
      chip.className = "attachment-chip";
      chip.textContent = `📎 ${file.name}`;
      chips.appendChild(chip);
    });
    bubble.appendChild(chips);
  }

  if (role === "assistant") {
    const related = ensureRelatedQuestions(content);
    if (related.length) {
      const rq = document.createElement("div");
      rq.className = "related-questions";
      rq.innerHTML = `<div class="related-title">Suggested follow-ups</div>`;
      const chips = document.createElement("div");
      chips.className = "related-chips";
      related.forEach(q => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "related-chip";
        btn.textContent = q;
        btn.addEventListener("click", () => {
          els.messageInput.value = q;
          autoGrow(els.messageInput);
          els.messageInput.focus();
        });
        chips.appendChild(btn);
      });
      rq.appendChild(chips);
      bubble.appendChild(rq);
    }

    if (!options.hideDisclaimer && options.mode !== "general_chat") {
      const disc = document.createElement("div");
      disc.className = "message-disclaimer";
      disc.textContent = "Educational clinical decision support only. Verify with trusted references and local protocols.";
      bubble.appendChild(disc);
    }
  }

  wrapper.appendChild(bubble);

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "message-action-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => copyMessageText(cleanContent));
  actions.appendChild(copyBtn);

  if (role === "user" && Number.isInteger(options.index) && !state.readOnlyShare) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "message-action-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditMessage(options.index));
    actions.appendChild(editBtn);
  }

  wrapper.appendChild(actions);

  row.appendChild(avatar);
  row.appendChild(wrapper);
  return row;
}

function copyMessageText(text) {
  navigator.clipboard.writeText(String(text || "").trim()).then(
    () => showToast("Copied"),
    () => showToast("Copy failed")
  );
}

function startEditMessage(index) {
  const conversation = currentConversation();
  if (!conversation || state.isGenerating || state.readOnlyShare) return;
  const message = conversation.messages[index];
  if (!message || message.role !== "user") return;
  state.editingMessageIndex = index;
  els.messageInput.value = message.content || "";
  autoGrow(els.messageInput);
  els.messageInput.focus();
  document.body.classList.add("editing-message");
  showToast("Editing message — send to regenerate from here");
}

function extractRelatedQuestions(text = "") {
  const source = String(text || "");
  const match = source.match(/(?:^|\n)#{0,3}\s*(?:Related questions|Follow-up questions|Suggested questions|أسئلة مقترحة|أسئلة متابعة)\s*:?\s*\n([\s\S]*)$/i);
  if (!match) return [];
  return match[1]
    .split(/\n+/)
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .filter(line => !/^(sources used|confidence)\s*:?/i.test(line))
    .slice(0, 3);
}

function stripRelatedQuestions(text = "") {
  return String(text || "").replace(/(?:^|\n)#{0,3}\s*(?:Related questions|Follow-up questions|Suggested questions|أسئلة مقترحة|أسئلة متابعة)\s*:?\s*\n[\s\S]*$/i, "").trim();
}

function stripGenericClosers(text = "") {
  let source = String(text || "").trim();
  const closerPatterns = [
    /\n+\s*(?:Do you have|Could you share|Can you share|Would you like|Need more detail|If you want)[^\n?؟]*(?:?|؟)?\s*$/i,
    /\n+\s*(?:هل لديك|هل عندك|هل تحتاج|تحب|لو عايز|ممكن تبعت)[^\n?؟]*(?:?|؟)?\s*$/i,
    /\n+\s*(?:Do you want me to|Can I help with anything else)[^\n?؟]*(?:?|؟)?\s*$/i
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of closerPatterns) {
      const next = source.replace(pattern, "").trim();
      if (next !== source) {
        source = next;
        changed = true;
      }
    }
  }
  return source;
}

function cleanAssistantVisibleContent(text = "") {
  return stripGenericClosers(stripRelatedQuestions(text));
}

function ensureRelatedQuestions(text = "") {
  const extracted = extractRelatedQuestions(text);
  if (extracted.length >= 3) return extracted.slice(0, 3);
  const fallback = buildFallbackRelatedQuestions(text);
  const merged = [];
  [...extracted, ...fallback].forEach(question => {
    const q = String(question || "").trim();
    if (q && !merged.some(x => x.toLowerCase() === q.toLowerCase())) merged.push(q);
  });
  return merged.slice(0, 3);
}

function buildFallbackRelatedQuestions(text = "") {
  const t = String(text || "").toLowerCase();
  if (/warfarin|amiodarone|inr|bleeding/.test(t)) {
    return [
      "Explain the INR monitoring plan after starting amiodarone with warfarin.",
      "What bleeding symptoms require urgent referral in a patient on warfarin?",
      "Which factors increase bleeding risk with warfarin and amiodarone?"
    ];
  }
  if (/ramipril|ace inhibitor|potassium|hyperkalemia|k\+/.test(t)) {
    return [
      "Explain how to monitor potassium and renal function with ACE inhibitors.",
      "When is potassium supplementation appropriate with ramipril?",
      "Which medicines increase hyperkalemia risk with ACE inhibitors?"
    ];
  }
  if (/metformin|egfr|lactic acidosis|لاكتك|لاكتيك/.test(t)) {
    return [
      "What diabetes alternatives are safer when eGFR is below 30?",
      "What symptoms suggest metformin-associated lactic acidosis?",
      "How should glucose be monitored after stopping or holding metformin?"
    ];
  }
  if (/active ingredient|excipient|سواغ|مادة فعالة|مادة اضافية|مادة إضافية|formulation|تصنيع/.test(t)) {
    return [
      "Give examples of common excipients and their functions.",
      "Explain how excipients can affect drug absorption or tolerability.",
      "Compare generic and brand medicines from a formulation perspective."
    ];
  }
  if (/triple whammy|diclofenac|furosemide|aki|renal|kidney/.test(t)) {
    return [
      "Explain the triple whammy mechanism and why AKI risk increases.",
      "What monitoring is needed after starting an NSAID in this combination?",
      "What safer analgesic options can be considered for this patient?"
    ];
  }
  if (/dizziness|دوخة|orthostatic|blood pressure|ضغط/.test(t)) {
    return [
      "How should orthostatic blood pressure be checked in this patient?",
      "Which antihypertensive classes commonly cause dizziness?",
      "What red flags make dizziness on blood pressure medicines urgent?"
    ];
  }
  return [
    "Check a medication interaction and explain the mechanism.",
    "Analyze a patient case using available labs and symptoms.",
    "List the missing clinical information needed for a safe recommendation."
  ];
}

function renderMarkdown(text = "") {
  let source = String(text || "");
  source = normalizeClinicalCallouts(source);
  if (window.marked && window.DOMPurify) {
    const html = window.marked.parse(source, { breaks: true, gfm: true });
    return window.DOMPurify.sanitize(html, {
      ADD_TAGS: ["div", "span"],
      ADD_ATTR: ["class"]
    });
  }
  return escapeHtml(source).replace(/\n/g, "<br>");
}

function normalizeClinicalCallouts(source = "") {
  const inlineMarkdown = (value = "") => escapeHtml(String(value || "").trim())
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  const make = (type, body) => {
    const cleanType = String(type || "INFO").toUpperCase();
    const cleanBody = inlineMarkdown(body);
    return `<div class="callout callout-${cleanType.toLowerCase()}"><div class="callout-icon">${cleanType === "WARNING" || cleanType === "IMPORTANT" ? "!" : "i"}</div><div class="callout-content"><div class="callout-title">${cleanType}</div><div class="callout-body">${cleanBody}</div></div></div>`;
  };

  return String(source)
    .replace(/^>\s*\[!(INFO|WARNING|IMPORTANT|TIP|NOTE)\]\s*(.*)$/gim, (_, type, body) => make(type, body))
    .replace(/^\[!(INFO|WARNING|IMPORTANT|TIP|NOTE)\]\s*(.*)$/gim, (_, type, body) => make(type, body))
    .replace(/^(WARNING|IMPORTANT|INFO|NOTE|TIP)\s*[—-]\s*(.*)$/gim, (_, type, body) => make(type, body));
}

// ============ SAFETY PANEL ============
function showSafetyPanel(alerts = []) {
  if (!alerts.length) {
    els.safetyPanel.classList.remove("open");
    return;
  }

  els.safetyContent.innerHTML = alerts.map(alert => `
    <div class="safety-item ${alert.severity === 'critical' ? 'danger' : ''}">
      <div class="safety-item-title">${escapeHtml(alert.title)}</div>
      <div class="safety-item-desc">${escapeHtml(alert.description)}</div>
      ${alert.action ? `<div class="safety-item-action">Action: ${escapeHtml(alert.action)}</div>` : ''}
    </div>
  `).join('');

  els.safetyPanel.classList.add("open");
}

function checkLocalSafety(text) {
  const alerts = [];
  const lower = text.toLowerCase();

  const emergencyTerms = ['unconscious', 'seizure', 'severe bleeding', 'chest pain', 'anaphylaxis'];
  if (emergencyTerms.some(t => lower.includes(t)) && !lower.includes('emergency') && !lower.includes('urgent')) {
    alerts.push({
      severity: 'critical',
      title: 'Emergency Context Detected',
      description: 'The response may involve emergency symptoms. Ensure proper escalation is mentioned.',
      action: 'Add emergency disclaimer'
    });
  }

  if (lower.includes('warfarin') && !lower.includes('inr')) {
    alerts.push({
      severity: 'high',
      title: 'Warfarin without INR',
      description: 'Warfarin discussion should typically include INR monitoring.',
      action: 'Mention INR monitoring'
    });
  }

  if (alerts.length) showSafetyPanel(alerts);
}

// ============ SMART AUTO-SCROLL ============
let userScrolledUp = false;
els.messages.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = els.messages;
  userScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
});

function scrollToBottom(force = false) {
  if (force || !userScrolledUp) {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.isGenerating || state.readOnlyShare) return;

  let conversation = currentConversation();
  if (!conversation) {
    await createNewConversation(false);
    conversation = currentConversation();
  }

  const text = els.messageInput.value.trim();
  if (!text && !state.pendingFiles.length) return;

  const attachments = await buildAttachmentPayloads(state.pendingFiles);
  const userContent = text || "[Attached files for case analysis]";

  if (Number.isInteger(state.editingMessageIndex)) {
    conversation.messages = conversation.messages.slice(0, state.editingMessageIndex);
    state.editingMessageIndex = null;
    document.body.classList.remove("editing-message");
  }

  const userMessage = {
    role: "user",
    content: userContent,
    mode: state.activeMode,
    attachments,
    created_at: nowIso()
  };

  conversation.messages.push(userMessage);
  if (isPlaceholderTitle(conversation.title)) conversation.title = makeTitle(userContent);
  conversation.mode = state.activeMode;
  conversation.updated_at = nowIso();

  els.messageInput.value = "";
  autoGrow(els.messageInput);
  state.pendingFiles = [];
  renderFileChips();

  if (state.activeMode === "general_chat" && !attachments.length && isShortGreetingText(userContent)) {
    const assistantMessage = {
      role: "assistant",
      content: localGreetingReply(),
      mode: "general_chat",
      created_at: nowIso(),
      thinkingTime: 0,
      hideSuggestions: true,
      hideDisclaimer: true,
      local: true
    };
    conversation.messages.push(assistantMessage);
    conversation.mode = "general_chat";
    conversation.updated_at = nowIso();
    renderCurrentConversation();
    await persistConversation(conversation, conversation);
    els.messageInput.focus();
    return;
  }

  renderCurrentConversation();
  await persistConversation(conversation, conversation);

  await streamAssistantReply(conversation);
}

function isPlaceholderTitle(title = "") {
  return !String(title).trim() || ["new clinical chat", "new chat", "untitled chat"].includes(String(title).trim().toLowerCase());
}

function makeTitle(text) {
  const cleaned = String(text || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Attached case";
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.replace(/[.,:;!?،؛؟]+$/g, "").slice(0, 58) || "New chat";
}

async function buildAttachmentPayloads(files) {
  const payloads = [];
  for (const file of files) {
    const item = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size
    };
    if (/^(text\/|application\/json|text\/csv)/.test(item.type) || /\.(txt|md|csv|json)$/i.test(file.name)) {
      item.text = await file.text();
      if (item.text.length > 12000) item.text = `${item.text.slice(0, 12000)}\n\n[File truncated after 12,000 characters]`;
    }
    payloads.push(item);
  }
  return payloads;
}

// ============ STREAMING WITH THINKING STATE ============
function showThinkingState(container) {
  const box = document.createElement("div");
  box.className = "thinking-container";
  box.innerHTML = `
    <div class="thinking-pulse"></div>
    <span class="thinking-text">Analyzing</span>
    <span class="thinking-timer" id="thinkingTimer">0.0s</span>
  `;
  container.innerHTML = "";
  container.appendChild(box);

  const start = performance.now();
  const timer = setInterval(() => {
    const el = document.getElementById("thinkingTimer");
    if (el) el.textContent = ((performance.now() - start) / 1000).toFixed(1) + "s";
  }, 100);

  return () => clearInterval(timer);
}

async function streamAssistantReply(conversation) {
  const assistantMessage = {
    role: "assistant",
    content: "",
    mode: state.activeMode,
    created_at: nowIso(),
    thinkingTime: 0
  };
  conversation.messages.push(assistantMessage);
  renderCurrentConversation();

  const assistantRow = els.messagesInner.lastElementChild;
  const assistantBody = assistantRow.querySelector(".message-bubble");

  const clearTimer = showThinkingState(assistantBody);

  state.isGenerating = true;
  document.body.classList.add("generating");
  state.abortController = new AbortController();
  els.stopBtn.classList.remove("hidden");
  els.sendBtn.disabled = true;

  const start = performance.now();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: state.activeMode,
        modeInstruction: MODE_META[state.activeMode].prompt,
        messages: conversation.messages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments || []
        })),
        stream: true
      }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(parseErrorText(errorText) || `Request failed (${response.status})`);
    }

    const serverMode = response.headers.get("X-Nexus-Mode");
    if (serverMode && MODE_META[serverMode] && serverMode !== state.activeMode) {
      selectMode(serverMode, false);
      assistantMessage.mode = serverMode;
      conversation.mode = serverMode;
    }

    clearTimer();
    assistantMessage.thinkingTime = (performance.now() - start) / 1000;

    const contentType = response.headers.get("content-type") || "";
    if (response.body && !contentType.includes("application/json")) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        assistantMessage.content = buffer;
        assistantBody.innerHTML = renderMarkdown(cleanAssistantVisibleContent(buffer));
        assistantBody.classList.add("streaming");
        scrollToBottom();
      }

      assistantBody.classList.remove("streaming");
    } else {
      const data = await response.json();
      assistantMessage.content = data.reply || "### Temporary response issue\nNexus did not receive text from the model for this turn. Please resend the question or choose a suggested clinical prompt below.";
      assistantMessage.thinkingTime = (performance.now() - start) / 1000;
      assistantBody.innerHTML = renderMarkdown(cleanAssistantVisibleContent(assistantMessage.content));
    }

    if (!assistantMessage.content.trim()) {
      assistantMessage.content = "### Temporary response issue\nNexus did not receive text from the model for this turn. Please resend the question or choose a suggested clinical prompt below.";
    }

    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, conversation);

    checkLocalSafety(assistantMessage.content);

  } catch (error) {
    clearTimer();
    if (error.name === "AbortError") {
      assistantMessage.content = `${assistantMessage.content}\n\n> [!NOTE] Generation stopped by user.`.trim();
    } else {
      assistantMessage.content = `### Connection error\n${error.message}`;
    }
    assistantMessage.thinkingTime = (performance.now() - start) / 1000;
    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, conversation).catch(console.error);
  } finally {
    state.isGenerating = false;
    document.body.classList.remove("generating");
    state.abortController = null;
    els.stopBtn.classList.add("hidden");
    els.sendBtn.disabled = false;
  }
}

function finalizeAssistantNode(body, message) {
  const related = ensureRelatedQuestions(message.content);
  body.innerHTML = renderMarkdown(cleanAssistantVisibleContent(message.content));
  if (related.length) {
    const rq = document.createElement("div");
    rq.className = "related-questions";
    rq.innerHTML = `<div class="related-title">Suggested follow-ups</div>`;
    const chips = document.createElement("div");
    chips.className = "related-chips";
    related.forEach(q => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "related-chip";
      btn.textContent = q;
      btn.addEventListener("click", () => {
        els.messageInput.value = q;
        autoGrow(els.messageInput);
        els.messageInput.focus();
      });
      chips.appendChild(btn);
    });
    rq.appendChild(chips);
    body.appendChild(rq);
  }

  if (message.thinkingTime) {
    const thinking = document.createElement("div");
    thinking.className = "thinking-time";
    thinking.textContent = `Thinking time: ${message.thinkingTime.toFixed(1)}s`;
    body.prepend(thinking);
  }

  const disclaimer = document.createElement("div");
  disclaimer.className = "message-disclaimer";
  disclaimer.textContent = "Educational clinical decision support only. Verify with trusted references and local protocols.";
  body.appendChild(disclaimer);

  scrollToBottom(true);
}

function parseErrorText(text) {
  try {
    const data = JSON.parse(text);
    return data.error || data.details?.error?.message || text;
  } catch {
    if (text.trim().startsWith("<")) return "The API route is not available here. Deploy frontend and /api/chat on Vercel, or set NEXUS_API_ENDPOINT to your Vercel API URL.";
    return text.slice(0, 240);
  }
}

function setComposerDisabled(disabled) {
  els.messageInput.disabled = disabled;
  els.attachBtn.disabled = disabled;
  els.sendBtn.disabled = disabled;
  els.messageInput.placeholder = disabled ? "Shared conversation is read-only" : "Ask about a drug, case, or interaction…";
}

function renderFileChips() {
  els.attachedFiles.innerHTML = "";
  els.attachedFiles.classList.toggle("hidden", state.pendingFiles.length === 0);
  state.pendingFiles.forEach((file, index) => {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";
    chip.innerHTML = `📎 ${escapeHtml(file.name)} <button type="button" aria-label="Remove file">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      state.pendingFiles.splice(index, 1);
      renderFileChips();
    });
    els.attachedFiles.appendChild(chip);
  });
}

function openConversationMenu(event, conversation) {
  event.stopPropagation();
  closeDropdown();

  const rect = event.currentTarget.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "dropdown";
  const menuWidth = Math.min(220, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300));
  menu.style.width = `${menuWidth}px`;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.innerHTML = `
    <button class="dropdown-item" data-action="pin">${conversation.pinned ? "Unpin" : "Pin"}</button>
    <button class="dropdown-item" data-action="rename">Rename</button>
    <button class="dropdown-item" data-action="share">Share</button>
    <button class="dropdown-item" data-action="archive">${conversation.archived ? "Unarchive" : "Archive"}</button>
    <button class="dropdown-item danger" data-action="delete">Delete</button>
  `;
  menu.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    closeDropdown();
    await handleConversationAction(action, conversation);
  });
  document.body.appendChild(menu);
  state.dropdown = menu;
}

async function handleConversationAction(action, conversation) {
  if (action === "pin") return persistConversation(conversation, { pinned: !conversation.pinned });
  if (action === "rename") {
    const title = prompt("New conversation name", conversation.title);
    if (title?.trim()) await persistConversation(conversation, { title: title.trim() });
    return;
  }
  if (action === "share") return shareConversation(conversation);
  if (action === "archive") {
    await persistConversation(conversation, { archived: !conversation.archived });
    if (state.currentConversationId === conversation.id) {
      state.currentConversationId = state.conversations[0]?.id || null;
      if (!state.currentConversationId && !state.showArchived) await createNewConversation(false);
      renderAll();
    }
    return;
  }
  if (action === "delete") return deleteConversation(conversation);
}

function closeDropdown() {
  if (state.dropdown) {
    state.dropdown.remove();
    state.dropdown = null;
  }
}

async function shareConversation(conversation) {
  if (!conversation) return;
  let url = "";
  try {
    if (HAS_SUPABASE && !state.readOnlyShare) {
      const { data, error } = await supabase
        .from("conversation_shares")
        .insert({
          conversation_id: conversation.id,
          owner_id: state.user.id,
          title: conversation.title || makeTitle(conversation.messages?.find(m => m.role === "user")?.content || "Shared chat"),
          mode: conversation.mode,
          messages: conversation.messages
        })
        .select("id")
        .single();
      if (error) throw error;
      url = `${location.origin}${location.pathname}?share=${data.id}`;
    } else {
      const shareId = uid("share");
      const shares = getLocalJson(localSharesKey(), {});
      shares[shareId] = conversation;
      setLocalJson(localSharesKey(), shares);
      url = `${location.origin}${location.pathname}?share=${shareId}`;
    }
    await navigator.clipboard.writeText(url);
    showToast("Share link copied");
  } catch (error) {
    showToast(error.message || "Could not create share link");
  }
}

async function loadSharedConversation(shareId) {
  let shared = null;
  if (HAS_SUPABASE) {
    const { data, error } = await supabase.rpc("get_shared_conversation", { p_share_id: shareId });
    if (!error && data && data.length) shared = data[0];
  }
  if (!shared) {
    const shares = getLocalJson(localSharesKey(), {});
    shared = shares[shareId];
  }

  if (!shared) {
    showToast("Shared conversation not found");
    showAuth();
    return false;
  }

  const conversation = normalizeConversation({
    ...shared,
    id: shared.id || shareId,
    title: `${shared.title || "Shared chat"} (shared)`,
    messages: Array.isArray(shared.messages) ? shared.messages : []
  });
  state.conversations = [conversation];
  state.currentConversationId = conversation.id;
  state.activeMode = conversation.mode || "general_chat";
  selectMode(state.activeMode, false);
  await enterApp({ id: "shared_viewer", email: "Shared conversation", user_metadata: { full_name: "Shared" } }, { readOnlyShare: true });
  return true;
}

function openSidebarMobile() {
  els.sidebar.classList.add("open");
  els.sidebarBackdrop.classList.add("show");
}

function closeSidebarMobile() {
  els.sidebar.classList.remove("open");
  els.sidebarBackdrop.classList.remove("show");
}

async function handleNewChatClick() {
  await createNewConversation(true);
  closeSidebarMobile();
  setTimeout(() => els.messageInput.focus(), 80);
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.isGenerating) {
    state.abortController?.abort();
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    handleNewChatClick();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    els.messageInput.focus();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    if (els.sidebar.classList.contains('open')) {
      closeSidebarMobile();
    } else {
      openSidebarMobile();
    }
  }
});

function bindEvents() {
  els.loginTab.addEventListener("click", () => setAuthMode("login"));
  els.signupTab.addEventListener("click", () => setAuthMode("signup"));
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.logoutBtn.addEventListener("click", logout);
  els.newChatBtn.addEventListener("click", handleNewChatClick);
  els.newChatTopBtn?.addEventListener("click", handleNewChatClick);
  els.themeToggleBtn.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
  els.openSidebarBtn.addEventListener("click", openSidebarMobile);
  els.closeSidebarBtn.addEventListener("click", closeSidebarMobile);
  els.sidebarBackdrop.addEventListener("click", closeSidebarMobile);
  els.toggleArchiveBtn.addEventListener("click", async () => {
    state.showArchived = !state.showArchived;
    await loadConversations();
    state.currentConversationId = state.conversations[0]?.id || null;
    renderAll();
  });
  document.querySelectorAll(".mode-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      selectMode(btn.dataset.mode);
      closeSidebarMobile();
      setTimeout(() => els.messageInput.focus(), 50);
    });
  });
  els.chatForm.addEventListener("submit", sendMessage);
  els.messageInput.addEventListener("input", () => autoGrow(els.messageInput));
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      els.chatForm.requestSubmit();
    }
  });
  els.attachBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    state.pendingFiles.push(...Array.from(els.fileInput.files || []));
    els.fileInput.value = "";
    renderFileChips();
  });
  els.stopBtn.addEventListener("click", () => state.abortController?.abort());
  els.closeSafetyPanel?.addEventListener("click", () => els.safetyPanel.classList.remove("open"));

  document.addEventListener("click", (event) => {
    if (state.dropdown && !event.target.closest(".dropdown") && !event.target.closest(".history-actions")) closeDropdown();
  });
}

async function init() {
  bindEvents();
  setAuthMode("login");
  applyTheme(localStorage.getItem("nexus_theme") || "light");

  const params = new URLSearchParams(location.search);
  const shareId = params.get("share");
  if (shareId) {
    await loadSharedConversation(shareId);
    return;
  }

  if (HAS_SUPABASE) {
    const { data } = await supabase.auth.getSession();
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !state.user) enterApp(session.user);
      if (!session?.user && state.user && !state.readOnlyShare) showAuth();
    });
    if (data.session?.user) await enterApp(data.session.user);
    else showAuth();
  } else {
    const localUser = getLocalJson(localUserKey(), null);
    if (localUser) await enterApp(localUser);
    else showAuth();
  }
}

init().catch(error => {
  console.error(error);
  showToast(error.message || "App failed to start");
});

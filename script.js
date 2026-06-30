const API_ENDPOINT = window.NEXUS_API_ENDPOINT || "/api/chat";
const MAX_CONTEXT_MESSAGES_TO_SEND = 16;
const MAX_ATTACHMENTS = 4;
const MAX_TEXT_FILE_BYTES = 750 * 1024;
const MAX_QUICK_ACCESS_NOTES = 120;
const MAX_QUICK_ACCESS_CONTEXT_NOTES = 5;
const MAX_WORK_SHELF_ITEMS = 60;
console.info("Nexus build", window.NEXUS_BUILD || "v5.1.0-shadow-check");
const HAS_SUPABASE = false;
const supabase = null;

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
  messageRail: document.getElementById("messageRail"),
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
  quickAccessAddBtn: document.getElementById("quickAccessAddBtn"),
  quickAccessSearch: document.getElementById("quickAccessSearch"),
  quickAccessList: document.getElementById("quickAccessList"),
  quickAccessCount: document.getElementById("quickAccessCount"),
  quickAccessModal: document.getElementById("quickAccessModal"),
  quickAccessModalTitle: document.getElementById("quickAccessModalTitle"),
  quickAccessTitleInput: document.getElementById("quickAccessTitleInput"),
  quickAccessTagsInput: document.getElementById("quickAccessTagsInput"),
  quickAccessContentInput: document.getElementById("quickAccessContentInput"),
  quickAccessCancelBtn: document.getElementById("quickAccessCancelBtn"),
  quickAccessSaveBtn: document.getElementById("quickAccessSaveBtn"),
  quickAccessDeleteBtn: document.getElementById("quickAccessDeleteBtn"),
  workShelfList: document.getElementById("workShelfList"),
  workShelfCount: document.getElementById("workShelfCount"),
  workShelfClearBtn: document.getElementById("workShelfClearBtn")
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
  editingMessageIndex: null,
  quickAccess: [],
  quickAccessSearch: "",
  editingQuickAccessId: null,
  workShelf: []
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
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 2500);
}

function setAuthMessage(message, isError = false) {
  els.authMessage.textContent = message || "";
  els.authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function localUserKey() { return "nexus_local_user"; }
function localConversationsKey() { return `nexus_conversations_${state.user?.id || "guest"}`; }
function localSharesKey() { return "nexus_local_shares"; }
function localQuickAccessKey() { return `nexus_quick_access_${state.user?.id || "guest"}`; }
function localWorkShelfKey() { return `nexus_work_shelf_${state.user?.id || "guest"}`; }

function getLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function setLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function withTimeout(promise, ms, label = "Request timed out") {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function buildLocalUser(email, fullName) {
  return {
    id: "local_user",
    email: email || "demo@nexus.local",
    user_metadata: { full_name: fullName || "Local Demo" }
  };
}
function isShortGreetingText(text = "") {
  const t = String(text || "").trim().toLowerCase();
  return /^(hi|hello|hey|السلام عليكم|اهلا|أهلا|ازيك|عامل ايه|هاي|هلا|صباح الخير|مساء الخير)[!.؟\s]*$/.test(t);
}

function localGreetingReply() {
  return "Hi 👋 I’m Nexus. How can I help?";
}

function buildApiMessages(messages = []) {
  return (messages || [])
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES_TO_SEND)
    .map(m => ({
      role: m.role,
      content: String(m.content || "").slice(0, 5000),
      attachments: m.attachments || []
    }));
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
  const email = els.emailInput.value.trim() || "demo@nexus.local";
  const password = els.passwordInput.value;
  const fullName = els.nameInput.value.trim() || email.split("@")[0] || "Local Demo";
  setAuthMessage(HAS_SUPABASE ? "Connecting…" : "Opening local demo…");
  els.authSubmitBtn.disabled = true;

  try {
    if (!HAS_SUPABASE) {
      const user = buildLocalUser(email, fullName);
      setLocalJson(localUserKey(), user);
      await enterApp(user);
      return;
    }

    if (state.authMode === "signup") {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        }),
        9000,
        "Supabase signup timed out. Check URL/Anon key or use local demo mode."
      );
      if (error) throw error;
      if (!data.session) {
        setAuthMessage("Account created. Check your email if confirmation is enabled.");
        return;
      }
      await enterApp(data.user || data.session.user);
    } else {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        9000,
        "Supabase login timed out. Check URL/Anon key or use local demo mode."
      );
      if (error) throw error;
      await enterApp(data.user || data.session.user);
    }
  } catch (error) {
    console.error(error);
    setAuthMessage(error.message || "Authentication failed.", true);
  } finally {
    els.authSubmitBtn.disabled = false;
  }
}

function showAuth() {
  // No-auth build: never block the user behind a login screen.
  document.body.classList.add("app-active");
  els.authPage?.classList.add("hidden");
  els.appRoot?.classList.remove("hidden");
}

async function enterApp(user, options = {}) {
  document.body.classList.add("app-active");
  state.user = user;
  state.readOnlyShare = Boolean(options.readOnlyShare);
  els.authPage?.classList.add("hidden");
  els.appRoot?.classList.remove("hidden");
  updateUserCard();
  applyTheme(localStorage.getItem("nexus_theme") || "light");
  loadQuickAccess();
  loadWorkShelf();
  renderQuickAccess();
  renderWorkShelf();

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
  localStorage.removeItem(localUserKey());
  state.user = null;
  state.conversations = [];
  state.currentConversationId = null;
  state.readOnlyShare = false;
  const localUser = buildLocalUser("local@nexus.app", "Nexus User");
  setLocalJson(localUserKey(), localUser);
  await enterApp(localUser);
  showToast("Local workspace reset.");
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
    closeSidebarAfterNavigation();
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
  document.querySelectorAll(".mode-btn, .mode-chip-btn").forEach(btn => {
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
  els.themeToggleBtn.querySelector("span:last-child").textContent = safeTheme === "dark" ? "Light mode" : "Dark mode";
}


function normalizeTags(value = "") {
  if (Array.isArray(value)) value = value.join(",");
  return Array.from(new Set(String(value || "")
    .split(/[#,،,;\s]+/)
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8)));
}

function quickAccessPreview(text = "", max = 110) {
  return String(text || "")
    .replace(/#+\s*/g, "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "No content";
}

function normalizeQuickAccessNote(note = {}) {
  const title = String(note.title || "").trim() || makeTitle(note.content || "Quick note");
  const content = String(note.content || "").trim();
  return {
    id: note.id || uid("qa"),
    title: title.slice(0, 80),
    tags: normalizeTags(note.tags || []),
    content: content.slice(0, 6000),
    created_at: note.created_at || nowIso(),
    updated_at: note.updated_at || nowIso()
  };
}

function loadQuickAccess() {
  if (!state.user) return;
  state.quickAccess = getLocalJson(localQuickAccessKey(), [])
    .map(normalizeQuickAccessNote)
    .filter(note => note.content)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, MAX_QUICK_ACCESS_NOTES);
}

function saveQuickAccess() {
  if (!state.user) return;
  setLocalJson(localQuickAccessKey(), state.quickAccess.slice(0, MAX_QUICK_ACCESS_NOTES));
}

function tokenizeQuickText(text = "") {
  return Array.from(new Set(String(text || "")
    .toLowerCase()
    .replace(/[#*_`~()[\]{}.,:;!?،؛؟/\\|+\-=]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .slice(0, 140)));
}

function scoreQuickAccessNote(note, text = "") {
  const hay = `${note.title} ${(note.tags || []).join(" ")} ${note.content}`.toLowerCase();
  const tokens = tokenizeQuickText(text);
  let score = 0;
  for (const token of tokens) {
    if ((note.tags || []).some(tag => tag.includes(token) || token.includes(tag))) score += 5;
    if (String(note.title || "").toLowerCase().includes(token)) score += 3;
    if (hay.includes(token)) score += 1;
  }
  return score;
}

function getRelevantQuickAccess(text = "", limit = 3) {
  const source = String(text || "").trim();
  if (!source || !state.quickAccess.length) return [];
  return state.quickAccess
    .map(note => ({ note, score: scoreQuickAccessNote(note, source) }))
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score || new Date(b.note.updated_at) - new Date(a.note.updated_at))
    .slice(0, limit)
    .map(item => item.note);
}

function getLatestUserMessageText(conversation = currentConversation()) {
  const messages = conversation?.messages || [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return messages[i].content || "";
  }
  return "";
}

function buildQuickAccessContext(latestUserText = "") {
  const notes = getRelevantQuickAccess(latestUserText, MAX_QUICK_ACCESS_CONTEXT_NOTES);
  if (!notes.length) return "";
  return notes.map((note, index) => {
    const tags = note.tags?.length ? ` | Tags: ${note.tags.join(", ")}` : "";
    return `Quick Access ${index + 1}: ${note.title}${tags}\n${note.content.slice(0, 1400)}`;
  }).join("\n\n---\n\n");
}

function renderQuickAccess() {
  if (!els.quickAccessList) return;
  const query = String(state.quickAccessSearch || "").trim().toLowerCase();
  const notes = state.quickAccess.filter(note => {
    if (!query) return true;
    const hay = `${note.title} ${(note.tags || []).join(" ")} ${note.content}`.toLowerCase();
    return hay.includes(query.replace(/^#/, ""));
  });

  if (els.quickAccessCount) els.quickAccessCount.textContent = `${state.quickAccess.length} saved`;
  els.quickAccessList.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("div");
    empty.className = "quick-empty";
    empty.textContent = state.quickAccess.length ? "No matching notes." : "Save rules, scripts, or templates here. Relevant notes can appear under answers and be sent as context.";
    els.quickAccessList.appendChild(empty);
    return;
  }

  notes.slice(0, 30).forEach(note => {
    const item = document.createElement("article");
    item.className = "quick-item";
    item.role = "listitem";
    item.innerHTML = `
      <div class="quick-item-top">
        <div class="quick-item-title">${escapeHtml(note.title)}</div>
      </div>
      <div class="quick-item-preview">${escapeHtml(quickAccessPreview(note.content, 140))}</div>
      ${note.tags?.length ? `<div class="quick-tags">${note.tags.map(tag => `<span class="quick-tag">#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="quick-item-actions">
        <button class="quick-mini-btn" type="button" data-action="insert">Insert</button>
        <button class="quick-mini-btn" type="button" data-action="edit">Edit</button>
        <button class="quick-mini-btn danger" type="button" data-action="delete">Delete</button>
      </div>
    `;
    item.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "insert") return insertQuickAccessNote(note);
      if (action === "edit") return openQuickAccessModal(note);
      if (action === "delete") return deleteQuickAccessNote(note.id);
    });
    els.quickAccessList.appendChild(item);
  });
}

function createQuickRecallNode(text = "") {
  const notes = getRelevantQuickAccess(text, 3);
  if (!notes.length) return null;
  const wrap = document.createElement("div");
  wrap.className = "quick-recall";
  const title = document.createElement("div");
  title.className = "quick-recall-title";
  title.textContent = "From My Quick Access";
  wrap.appendChild(title);
  const list = document.createElement("div");
  list.className = "quick-recall-list";
  notes.forEach(note => {
    const item = document.createElement("div");
    item.className = "quick-recall-item";
    item.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(quickAccessPreview(note.content, 155))}</span>`;
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

function getSelectedTextInside(row) {
  const selection = window.getSelection?.();
  const selected = String(selection?.toString() || "").trim();
  if (!selected || !selection.rangeCount || !row) return "";
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  return row.contains(ancestor) ? selected : "";
}

function openQuickAccessModal(note = null, seed = {}) {
  if (!els.quickAccessModal) return;
  state.editingQuickAccessId = note?.id || null;
  els.quickAccessModalTitle.textContent = note ? "Edit Quick Access" : "Save to Quick Access";
  els.quickAccessTitleInput.value = note?.title || seed.title || "";
  els.quickAccessTagsInput.value = (note?.tags || seed.tags || []).join(", ");
  els.quickAccessContentInput.value = note?.content || seed.content || "";
  els.quickAccessDeleteBtn.classList.toggle("hidden", !note);
  els.quickAccessModal.classList.remove("hidden");
  setTimeout(() => (els.quickAccessTitleInput.value ? els.quickAccessContentInput : els.quickAccessTitleInput).focus(), 50);
}

function closeQuickAccessModal() {
  state.editingQuickAccessId = null;
  els.quickAccessModal?.classList.add("hidden");
}

function saveQuickAccessFromModal() {
  const content = els.quickAccessContentInput.value.trim();
  if (!content) return showToast("Add note content first.");
  const title = els.quickAccessTitleInput.value.trim() || makeTitle(content);
  const tags = normalizeTags(els.quickAccessTagsInput.value);
  const existingIndex = state.quickAccess.findIndex(note => note.id === state.editingQuickAccessId);
  const note = normalizeQuickAccessNote({
    ...(existingIndex >= 0 ? state.quickAccess[existingIndex] : {}),
    title,
    tags,
    content,
    updated_at: nowIso()
  });
  if (existingIndex >= 0) state.quickAccess.splice(existingIndex, 1, note);
  else state.quickAccess.unshift(note);
  state.quickAccess = state.quickAccess
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, MAX_QUICK_ACCESS_NOTES);
  saveQuickAccess();
  renderQuickAccess();
  renderCurrentConversation();
  closeQuickAccessModal();
  showToast("Saved to Quick Access");
}

function deleteQuickAccessNote(id = state.editingQuickAccessId) {
  if (!id) return;
  const note = state.quickAccess.find(item => item.id === id);
  if (!note) return;
  if (!confirm(`Delete Quick Access note “${note.title}”?`)) return;
  state.quickAccess = state.quickAccess.filter(item => item.id !== id);
  saveQuickAccess();
  renderQuickAccess();
  renderCurrentConversation();
  closeQuickAccessModal();
  showToast("Quick Access note deleted");
}

function saveMessageToQuickAccess(row, role, content = "") {
  const selected = getSelectedTextInside(row);
  const bodyText = selected || String(content || "").trim();
  if (!bodyText) return;
  openQuickAccessModal(null, {
    title: makeTitle(bodyText),
    tags: role === "assistant" ? ["nexus"] : ["case"],
    content: bodyText
  });
}

function insertQuickAccessNote(note) {
  const current = els.messageInput.value.trim();
  const block = `${note.title}\n${note.content}`.trim();
  els.messageInput.value = current ? `${current}\n\n${block}` : block;
  autoGrow(els.messageInput);
  els.messageInput.focus();
  showToast("Inserted into composer");
}

function workShelfPreview(text = "", max = 120) {
  return String(text || "")
    .replace(/#+\s*/g, "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "Empty item";
}

function classifyWorkShelfItem(text = "", role = "assistant") {
  const t = String(text || "").toLowerCase();
  if (role === "user") return "case";
  if (/\b(k\+?|potassium|creatinine|egfr|inr|alt|ast|hba1c|hb|platelets|labs?)\b|تحاليل|كرياتينين|بوتاسيوم|سيولة/.test(t)) return "lab/risk";
  if (/red flag|urgent|emergency|bleeding|hyperkalemia|aki|toxicity|arrhythmia|نزيف|طارئ|خطير|سمية/.test(t)) return "risk";
  if (/recommend|hold|avoid|monitor|contact|review|توصية|وقف|تجنب|تابع/.test(t)) return "recommendation";
  if (/counsel|patient|explain|ask|educat|نصح|اسأل|المريض/.test(t)) return "counseling";
  return "note";
}

function normalizeWorkShelfItem(item = {}) {
  const content = String(item.content || "").trim();
  const kind = String(item.kind || classifyWorkShelfItem(content, item.sourceRole)).slice(0, 28);
  return {
    id: item.id || uid("ws"),
    kind,
    content: content.slice(0, 5000),
    sourceRole: item.sourceRole || "assistant",
    created_at: item.created_at || nowIso()
  };
}

function loadWorkShelf() {
  if (!state.user) return;
  state.workShelf = getLocalJson(localWorkShelfKey(), [])
    .map(normalizeWorkShelfItem)
    .filter(item => item.content)
    .slice(0, MAX_WORK_SHELF_ITEMS);
}

function saveWorkShelf() {
  if (!state.user) return;
  setLocalJson(localWorkShelfKey(), state.workShelf.slice(0, MAX_WORK_SHELF_ITEMS));
}

function addWorkShelfItem(content = "", sourceRole = "assistant") {
  const clean = String(content || "").trim();
  if (!clean) return;
  const item = normalizeWorkShelfItem({ content: clean, sourceRole });
  state.workShelf.unshift(item);
  state.workShelf = state.workShelf.slice(0, MAX_WORK_SHELF_ITEMS);
  saveWorkShelf();
  renderWorkShelf();
  showToast("Added to Work Shelf");
}

function saveMessageToWorkShelf(row, role, content = "") {
  const selected = getSelectedTextInside(row);
  const bodyText = selected || String(content || "").trim();
  if (!bodyText) return;
  addWorkShelfItem(bodyText, role);
}

function deleteWorkShelfItem(id) {
  state.workShelf = state.workShelf.filter(item => item.id !== id);
  saveWorkShelf();
  renderWorkShelf();
  showToast("Removed from Work Shelf");
}

function clearWorkShelf() {
  if (!state.workShelf.length) return;
  if (!confirm("Clear all Work Shelf items?")) return;
  state.workShelf = [];
  saveWorkShelf();
  renderWorkShelf();
  showToast("Work Shelf cleared");
}

function renderWorkShelf() {
  if (!els.workShelfList) return;
  els.workShelfList.innerHTML = "";
  if (els.workShelfCount) els.workShelfCount.textContent = `${state.workShelf.length} item${state.workShelf.length === 1 ? "" : "s"}`;

  if (!state.workShelf.length) {
    const empty = document.createElement("div");
    empty.className = "work-empty";
    empty.textContent = "Add key risks, labs, recommendations, or selected text here. Then generate a note, counseling script, prescriber message, or monitoring plan.";
    els.workShelfList.appendChild(empty);
    return;
  }

  state.workShelf.slice(0, 18).forEach(item => {
    const node = document.createElement("article");
    node.className = "work-item";
    node.role = "listitem";
    node.innerHTML = `
      <div class="work-item-top">
        <span class="work-kind">${escapeHtml(item.kind)}</span>
        <button class="work-remove" type="button" aria-label="Remove item">×</button>
      </div>
      <div class="work-preview">${escapeHtml(workShelfPreview(item.content, 150))}</div>
    `;
    node.querySelector(".work-remove").addEventListener("click", () => deleteWorkShelfItem(item.id));
    node.addEventListener("dblclick", () => {
      const current = els.messageInput.value.trim();
      els.messageInput.value = current ? `${current}\n\n${item.content}` : item.content;
      autoGrow(els.messageInput);
      els.messageInput.focus();
      showToast("Shelf item inserted");
    });
    els.workShelfList.appendChild(node);
  });
}

function buildWorkShelfPrompt(kind = "intervention_note") {
  const labels = {
    intervention_note: "pharmacist intervention note",
    patient_counseling: "patient-friendly counseling script",
    prescriber_message: "concise prescriber message",
    monitoring_plan: "monitoring and follow-up plan"
  };
  const title = labels[kind] || "clinical summary";
  const shelfBlock = state.workShelf.map((item, index) => `${index + 1}. [${item.kind}] ${item.content}`).join("\n\n");
  return `Use the Work Shelf items below to generate a ${title}.\n\nRules:\n- Do not invent patient details not present in the shelf.\n- Separate urgent safety issues from routine recommendations.\n- Use safe pharmacist wording: recommend prescriber review for medication holds/changes when appropriate.\n- Mention missing critical information if it changes the decision.\n- Keep it practical and ready to copy.\n\nWork Shelf:\n${shelfBlock}`;
}

function generateFromWorkShelf(kind) {
  if (!state.workShelf.length) return showToast("Add items to Work Shelf first.");
  if (state.isGenerating || state.readOnlyShare) return;
  const prompt = buildWorkShelfPrompt(kind);
  const extra = els.messageInput.value.trim();
  els.messageInput.value = extra ? `${prompt}\n\nExtra instruction from user:\n${extra}` : prompt;
  autoGrow(els.messageInput);
  selectMode("case_analysis", false);
  els.chatForm.requestSubmit();
}


function buildShadowCheckPrompt(row, content = "") {
  const conversation = currentConversation();
  const selected = getSelectedTextInside(row);
  const answerOrExcerpt = (selected || content || "").trim().slice(0, 7000);
  const latestUser = getLatestUserMessageText(conversation).slice(0, 4000);
  return `Run Nexus Shadow Check on this clinical content.

Focus only on:
- Hidden risks the user may miss
- Missing or blind-spot data
- What would change urgency
- Pharmacist traps / unsafe assumptions
- What to verify before acting

Do not repeat the full answer. Do not invent patient data. Use safe pharmacist wording and mention if the case is not enough for patient-specific decisions.

Original user question/case:
${latestUser || "[not available]"}

Answer or selected excerpt to audit:
${answerOrExcerpt || "[not available]"}`;
}

function runShadowCheck(row, role, content = "") {
  if (state.isGenerating || state.readOnlyShare) return;
  const prompt = buildShadowCheckPrompt(row, content);
  const extra = els.messageInput.value.trim();
  els.messageInput.value = extra ? `${prompt}\n\nExtra instruction from user:\n${extra}` : prompt;
  autoGrow(els.messageInput);
  selectMode("case_analysis", false);
  els.chatForm.requestSubmit();
}

function renderAll() {
  renderHistory();
  renderQuickAccess();
  renderWorkShelf();
  renderCurrentConversation();
}

function renderHistory() {
  els.chatHistory.innerHTML = "";
  els.toggleArchiveBtn.classList.toggle("active", state.showArchived);
  els.toggleArchiveBtn.textContent = state.showArchived ? "Active" : "Archive";

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
    const groupNode = document.createElement("section");
    groupNode.className = "history-group";
    groupNode.innerHTML = `<div class="history-group-title">${escapeHtml(label)}</div>`;
    items.forEach(conversation => {
      const row = document.createElement("div");
      row.className = "history-row compact";
      row.role = "listitem";
      const displayTitle = conversation.title || makeTitle(conversation.messages?.find(m => m.role === "user")?.content || "New chat");
      row.innerHTML = `
        <button class="history-item ${conversation.id === state.currentConversationId ? "active" : ""}" type="button" title="${escapeHtml(displayTitle)}">
          <span class="history-title-text">${conversation.pinned ? "📌 " : ""}${escapeHtml(displayTitle)}</span>
        </button>
        <button class="history-dots" type="button" aria-label="Conversation actions">•••</button>
      `;
      row.querySelector(".history-item").addEventListener("click", () => {
        state.currentConversationId = conversation.id;
        selectMode(conversation.mode || "general_chat", false);
        renderAll();
        closeSidebarAfterNavigation();
      });
      row.querySelector(".history-dots").addEventListener("click", (event) => openConversationMenu(event, conversation));
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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderCurrentConversation() {
  const conversation = currentConversation();
  els.messages.innerHTML = `<div class="messages-inner" id="messagesInner"></div>`;
  const inner = document.getElementById("messagesInner");

  if (!conversation) {
    inner.appendChild(welcomeNode());
    renderMessageRail();
    return;
  }

  els.conversationTitle.textContent = conversation.title || "New chat";
  els.activeModePill.textContent = MODE_META[conversation.mode]?.label || MODE_META[state.activeMode]?.label || MODE_META.general_chat.label;
  if (!conversation.messages.length) {
    inner.appendChild(welcomeNode());
    renderMessageRail();
  } else {
    conversation.messages.forEach((message, index) => {
      inner.appendChild(createMessageNode(message.role, message.content, {
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
  renderMessageRail();
  scrollToBottom();
}

function welcomeNode() {
  const node = document.createElement("div");
  node.className = "welcome";
  node.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-mark">Nx</div>
      <h2>How can I help?</h2>
      <p>Start with General Chat, or choose a clinical tool from the sidebar. Attach case files if needed and ask naturally.</p>
      <div class="prompt-grid">
        <button class="prompt-card" data-prompt="Explain the difference between ACE inhibitors and ARBs briefly.">
          <strong>General Chat</strong><span>Normal chat without forcing a tool.</span>
        </button>
        <button class="prompt-card" data-prompt="65-year-old male on ramipril + potassium supplement. No recent K or SCr. Analyze the risk.">
          <strong>Case Analysis</strong><span>Analyze a patient case with missing information.</span>
        </button>
        <button class="prompt-card" data-prompt="Check interaction: warfarin with amiodarone. Include mechanism, monitoring, and action plan.">
          <strong>Drug Interaction</strong><span>Safety check with severity and monitoring.</span>
        </button>
        <button class="prompt-card" data-prompt="Start Drug Reverse training for ACE inhibitors and hyperkalemia risk.">
          <strong>Drug Reverse</strong><span>Interactive training with clues and correction.</span>
        </button>
      </div>
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

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.innerHTML = `<span class="message-avatar">${role === "assistant" ? "Nx" : "You"}</span><span>${role === "assistant" ? "Nexus" : "You"}</span>`;

  const body = document.createElement("div");
  body.className = "message-content";

  const related = role === "assistant" && !options.hideSuggestions ? ensureRelatedQuestions(content) : [];
  const cleanContent = role === "assistant" ? cleanAssistantVisibleContent(content) : content;
  body.innerHTML = role === "assistant" ? renderMarkdown(cleanContent) : escapeHtml(content).replace(/\n/g, "<br>");

  if (options.attachments?.length && role === "user") {
    const files = document.createElement("div");
    files.className = "attached-files";
    options.attachments.forEach(file => {
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.textContent = `📎 ${file.name}`;
      files.appendChild(chip);
    });
    body.appendChild(files);
  }

  if (role === "assistant" && related.length) {
    body.appendChild(createRelatedQuestionsNode(related));
  }

  if (role === "assistant") {
    const recall = createQuickRecallNode(cleanContent);
    if (recall) body.appendChild(recall);
  }

  if (role === "assistant" && options.thinkingTime) {
    const thinking = document.createElement("div");
    thinking.className = "thinking-time";
    thinking.textContent = `Thinking time: ${options.thinkingTime.toFixed(1)}s`;
    body.prepend(thinking);
  }

  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "message-action-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => copyMessageText(role === "assistant" ? (row.querySelector(".message-content")?.innerText || cleanContent) : cleanContent));
  actions.appendChild(copyBtn);

  const quickBtn = document.createElement("button");
  quickBtn.type = "button";
  quickBtn.className = "message-action-btn save-quick";
  quickBtn.textContent = "Quick";
  quickBtn.title = "Save selected text or this message to My Quick Access";
  quickBtn.addEventListener("click", () => saveMessageToQuickAccess(row, role, role === "assistant" ? cleanContent : content));
  actions.appendChild(quickBtn);

  const shelfBtn = document.createElement("button");
  shelfBtn.type = "button";
  shelfBtn.className = "message-action-btn save-shelf";
  shelfBtn.textContent = "Shelf";
  shelfBtn.title = "Add selected text or this message to Work Shelf";
  shelfBtn.addEventListener("click", () => saveMessageToWorkShelf(row, role, role === "assistant" ? cleanContent : content));
  actions.appendChild(shelfBtn);

  if (role === "assistant") {
    const shadowBtn = document.createElement("button");
    shadowBtn.type = "button";
    shadowBtn.className = "message-action-btn save-shadow";
    shadowBtn.textContent = "Shadow";
    shadowBtn.title = "Run Nexus Shadow Check on this answer or selected excerpt";
    shadowBtn.addEventListener("click", () => runShadowCheck(row, role, cleanContent));
    actions.appendChild(shadowBtn);
  }

  if (role === "user" && Number.isInteger(options.index) && !state.readOnlyShare) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "message-action-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditMessage(options.index));
    actions.appendChild(editBtn);
  }

  if (role === "assistant" && !options.hideDisclaimer && options.mode !== "general_chat") {
    const disclaimer = document.createElement("div");
    disclaimer.className = "disclaimer";
    disclaimer.textContent = "Educational clinical decision support only. Confirm critical decisions with trusted references and local protocols.";
    body.appendChild(disclaimer);
  }

  row.appendChild(meta);
  row.appendChild(body);
  row.appendChild(actions);
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

function isGreetingLikeAssistantContent(text = "") {
  const t = String(text || "").trim().toLowerCase();
  return t.length < 90 && /^(hi|hello|hey|hi there|أهلاً|اهلا|مرحب)/i.test(t);
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
    /\n+\s*(?:Do you have|Could you share|Can you share|Would you like|Need more detail|If you want)[^\n?؟]*(?:\?|\؟)?\s*$/i,
    /\n+\s*(?:هل لديك|هل عندك|هل تحتاج|تحب|لو عايز|ممكن تبعت)[^\n?؟]*(?:\?|\؟)?\s*$/i,
    /\n+\s*(?:Do you want me to|Can I help with anything else)[^\n?؟]*(?:\?|\؟)?\s*$/i
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
  if (isGreetingLikeAssistantContent(text)) return [];
  const complexCaseHits = [
    /hyperkalemia|potassium|k\+|بوتاسيوم/.test(t),
    /triple whammy|aki|acute kidney|oliguria|urine output|renal|kidney|egfr|creatinine/.test(t),
    /warfarin|amiodarone|inr|bleeding|bruising/.test(t),
    /metformin|lactic acidosis/.test(t)
  ].filter(Boolean).length;
  if (complexCaseHits >= 2 || /most urgent medication-related problems|clinical pharmacist case analysis|drug related problems/.test(t)) {
    return [
      "Prioritize urgent actions for hyperkalemia, AKI, and bleeding risk in this case.",
      "Create a prescriber-directed medication review plan for the high-risk medicines.",
      "Build a 24–48 hour monitoring plan for potassium, renal function, INR, and bleeding signs."
    ];
  }
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

function createRelatedQuestionsNode(questions = []) {
  const wrap = document.createElement("div");
  wrap.className = "related-questions";
  const title = document.createElement("div");
  title.className = "related-title";
  title.textContent = "Suggested next questions";
  wrap.appendChild(title);
  questions.slice(0, 3).forEach(question => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "related-chip";
    btn.textContent = question;
    btn.addEventListener("click", () => {
      els.messageInput.value = question;
      autoGrow(els.messageInput);
      els.messageInput.focus();
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function compactPreview(text = "", max = 84) {
  return String(text || "")
    .replace(/#+\s*/g, "")
    .replace(/\[[!A-Z]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "Empty message";
}

function setActiveRailSegment(index) {
  if (!els.messageRail) return;
  els.messageRail.querySelectorAll(".rail-segment").forEach(segment => {
    segment.classList.toggle("active", Number(segment.dataset.targetIndex) === Number(index));
  });
}

function updateActiveRailFromViewport() {
  if (!els.messageRail) return;
  const rows = Array.from(document.querySelectorAll(".message-row[data-message-index]"));
  if (!rows.length) return;
  const containerRect = els.messages.getBoundingClientRect();
  const anchor = containerRect.top + containerRect.height * 0.38;
  let best = rows[0];
  let bestDistance = Infinity;
  rows.forEach(row => {
    const rect = row.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const distance = Math.abs(center - anchor);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  });
  setActiveRailSegment(best.dataset.messageIndex);
}

function renderMessageRail() {
  if (!els.messageRail) return;
  const conversation = currentConversation();
  els.messageRail.innerHTML = "";
  const messages = conversation?.messages || [];
  if (messages.length < 2) return;
  messages.slice(-42).forEach((message, visibleIndex) => {
    const absoluteIndex = messages.length > 42 ? messages.length - 42 + visibleIndex : visibleIndex;
    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = `rail-segment ${message.role}`;
    segment.dataset.targetIndex = String(absoluteIndex);
    segment.dataset.tooltip = `${message.role === "assistant" ? "Nexus" : "You"}: ${compactPreview(message.content)}`;
    segment.title = segment.dataset.tooltip;
    segment.setAttribute("aria-label", segment.dataset.tooltip);
    segment.addEventListener("click", () => {
      const target = document.querySelector(`[data-message-index="${absoluteIndex}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.remove("jump-highlight");
      void target.offsetWidth;
      target.classList.add("jump-highlight");
      setActiveRailSegment(absoluteIndex);
      setTimeout(() => target.classList.remove("jump-highlight"), 1200);
    });
    els.messageRail.appendChild(segment);
  });
  updateActiveRailFromViewport();
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
    return `<div class="callout callout-${cleanType.toLowerCase()}"><strong>${cleanType}</strong><span>${cleanBody}</span></div>`;
  };

  return String(source)
    .replace(/^>\s*\[!(INFO|WARNING|IMPORTANT|TIP|NOTE)\]\s*(.*)$/gim, (_, type, body) => make(type, body))
    .replace(/^\[!(INFO|WARNING|IMPORTANT|TIP|NOTE)\]\s*(.*)$/gim, (_, type, body) => make(type, body))
    .replace(/^(WARNING|IMPORTANT|INFO|NOTE|TIP)\s*[—-]\s*(.*)$/gim, (_, type, body) => make(type, body));
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
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
    await persistConversation(conversation, {});
    els.messageInput.focus();
    return;
  }

  renderCurrentConversation();
  await persistConversation(conversation, {});

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
  const incoming = Array.from(files || []);
  const selected = incoming.slice(0, MAX_ATTACHMENTS);
  if (incoming.length > MAX_ATTACHMENTS) {
    showToast(`Only the first ${MAX_ATTACHMENTS} text files were attached.`);
  }

  const payloads = [];
  const unsupported = [];
  for (const file of selected) {
    const item = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size
    };

    const isSupportedText = /^(text\/|application\/json|text\/csv)/.test(item.type) || /\.(txt|md|csv|json)$/i.test(file.name);
    if (!isSupportedText) {
      item.extractionStatus = "not_supported";
      item.note = "Only .txt, .md, .csv, and .json files are currently read. Paste PDF/image text manually for now.";
      unsupported.push(file.name);
      payloads.push(item);
      continue;
    }

    if (file.size > MAX_TEXT_FILE_BYTES) {
      item.extractionStatus = "too_large";
      item.note = `Text file exceeds ${Math.round(MAX_TEXT_FILE_BYTES / 1024)} KB. Paste the relevant section instead.`;
      unsupported.push(file.name);
      payloads.push(item);
      continue;
    }

    item.text = await file.text();
    if (item.text.length > 12000) item.text = `${item.text.slice(0, 12000)}\n\n[File truncated after 12,000 characters]`;
    item.extractionStatus = "text_extracted";
    payloads.push(item);
  }

  if (unsupported.length) {
    showToast(`File content not read: ${unsupported.slice(0, 2).join(", ")}${unsupported.length > 2 ? "…" : ""}`);
  }

  return payloads;
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

  const inner = document.getElementById("messagesInner");
  const assistantRow = inner.lastElementChild;
  const assistantBody = assistantRow.querySelector(".message-content");
  assistantBody.innerHTML = `
    <div class="thinking-box">
      <span class="thinking-orb"><span>Nx</span></span>
      <span class="thinking-text">Thinking <span class="loader-dots"><span></span><span></span><span></span></span> <b id="thinkingCounter">0.0s</b></span>
    </div>
  `;

  state.isGenerating = true;
  document.body.classList.add("generating");
  state.abortController = new AbortController();
  els.stopBtn.classList.remove("hidden");
  els.sendBtn.disabled = true;

  const start = performance.now();
  let firstChunk = false;
  const timer = setInterval(() => {
    const counter = document.getElementById("thinkingCounter");
    if (counter) counter.textContent = `${((performance.now() - start) / 1000).toFixed(1)}s`;
  }, 100);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: state.activeMode,
        modeInstruction: MODE_META[state.activeMode].prompt,
        messages: buildApiMessages(conversation.messages),
        quickAccessContext: buildQuickAccessContext(getLatestUserMessageText(conversation)),
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

    const contentType = response.headers.get("content-type") || "";
    if (response.body && !contentType.includes("application/json")) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let targetBuffer = "";
      let displayedBuffer = "";
      let typingTimer = null;

      const renderDisplayed = () => {
        assistantMessage.content = displayedBuffer;
        assistantBody.innerHTML = renderMarkdown(cleanAssistantVisibleContent(displayedBuffer));
        assistantBody.classList.add("streaming");
        scrollToBottom();
      };

      const startTyping = () => {
        if (typingTimer) return;
        typingTimer = setInterval(() => {
          const remaining = targetBuffer.length - displayedBuffer.length;
          if (remaining <= 0) return;
          const step = remaining > 900 ? 30 : remaining > 360 ? 16 : remaining > 120 ? 7 : 3;
          displayedBuffer += targetBuffer.slice(displayedBuffer.length, displayedBuffer.length + step);
          renderDisplayed();
        }, 18);
      };

      const waitForTyping = () => new Promise(resolve => {
        const waiter = setInterval(() => {
          if (displayedBuffer.length >= targetBuffer.length) {
            clearInterval(waiter);
            if (typingTimer) {
              clearInterval(typingTimer);
              typingTimer = null;
            }
            resolve();
          }
        }, 20);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!firstChunk) {
          firstChunk = true;
          assistantMessage.thinkingTime = (performance.now() - start) / 1000;
          assistantBody.innerHTML = "";
        }
        targetBuffer += chunk;
        startTyping();
      }

      await waitForTyping();
      assistantBody.classList.remove("streaming");
      assistantMessage.content = targetBuffer;
    } else {
      const data = await response.json();
      assistantMessage.content = data.reply || "### Temporary response issue\nNexus did not receive text from the model for this turn. Please resend the question or choose a suggested clinical prompt below.";
      assistantMessage.thinkingTime = (performance.now() - start) / 1000;
      assistantBody.classList.add("streaming");
      await typeText(assistantMessage.content, assistantBody, assistantMessage);
      assistantBody.classList.remove("streaming");
    }

    if (!assistantMessage.content.trim()) {
      assistantMessage.content = "### Temporary response issue\nNexus did not receive text from the model for this turn. Please resend the question or choose a suggested clinical prompt below.";
    }
    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, {});
  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.content = `${assistantMessage.content}\n\n> [!NOTE] Generation stopped by user.`.trim();
    } else {
      assistantMessage.content = `### Connection error\n${error.message}`;
    }
    assistantMessage.thinkingTime = (performance.now() - start) / 1000;
    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, {}).catch(console.error);
  } finally {
    clearInterval(timer);
    state.isGenerating = false;
    document.body.classList.remove("generating");
    state.abortController = null;
    els.stopBtn.classList.add("hidden");
    els.sendBtn.disabled = false;
  }
}

function finalizeAssistantNode(body, message) {
  const related = message.hideSuggestions ? [] : ensureRelatedQuestions(message.content);
  body.innerHTML = renderMarkdown(cleanAssistantVisibleContent(message.content));
  if (related.length) body.appendChild(createRelatedQuestionsNode(related));
  const recall = createQuickRecallNode(message.content);
  if (recall) body.appendChild(recall);
  if (message.thinkingTime && !message.hideThinkingTime) {
    const thinking = document.createElement("div");
    thinking.className = "thinking-time";
    thinking.textContent = `Thinking time: ${message.thinkingTime.toFixed(1)}s`;
    body.prepend(thinking);
  }
  if (!message.hideDisclaimer && message.mode !== "general_chat") {
    const disclaimer = document.createElement("div");
    disclaimer.className = "disclaimer";
    disclaimer.textContent = "Educational clinical decision support only. Confirm critical decisions with trusted references and local protocols.";
    body.appendChild(disclaimer);
  }
  scrollToBottom();
}

async function typeText(text, element, message) {
  let output = "";
  const source = String(text || "");
  const render = () => {
    message.content = output;
    element.innerHTML = renderMarkdown(cleanAssistantVisibleContent(output));
  };

  for (let i = 0; i < source.length;) {
    const remaining = source.length - i;
    const step = remaining > 900 ? 42 : remaining > 360 ? 24 : remaining > 120 ? 12 : 5;
    output += source.slice(i, i + step);
    i += step;
    render();
    await new Promise(resolve => setTimeout(resolve, 18));
  }
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
  els.messageInput.placeholder = disabled ? "Shared conversation is read-only" : "Message Nexus…";
}

function renderFileChips() {
  els.attachedFiles.innerHTML = "";
  els.attachedFiles.classList.toggle("hidden", state.pendingFiles.length === 0);
  state.pendingFiles.forEach((file, index) => {
    const chip = document.createElement("span");
    chip.className = "file-chip";
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
    <button class="menu-btn" data-action="pin">${conversation.pinned ? "Unpin" : "Pin"}</button>
    <button class="menu-btn" data-action="rename">Rename</button>
    <button class="menu-btn" data-action="share">Share</button>
    <button class="menu-btn" data-action="archive">${conversation.archived ? "Unarchive" : "Archive"}</button>
    <button class="menu-btn danger" data-action="delete">Delete</button>
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
    showToast(HAS_SUPABASE ? "Share link copied" : "Share link copied (local demo only)");
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

async function exportConversationPdf(conversation = currentConversation()) {
  if (!conversation) return;

  const report = buildPdfReportNode(conversation);
  report.style.position = "absolute";
  report.style.left = "0";
  report.style.top = "0";
  report.style.zIndex = "-1";
  report.style.background = "#ffffff";
  document.body.prepend(report);
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch {}
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const filename = `${safeFilename(conversation.title || makeTitle(conversation.messages?.find(m => m.role === "user")?.content || "nexus-chat"))}.pdf`;

  try {
    if (window.html2pdf) {
      await window.html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: Math.min(2.2, window.devicePixelRatio || 2),
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-message", ".pdf-callout"] }
        })
        .from(report)
        .save();
      showToast("PDF exported cleanly");
    } else {
      const printWindow = window.open("", "_blank");
      if (!printWindow) throw new Error("Popup blocked. Allow popups to print/export.");
      printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(filename)}</title></head><body>${report.outerHTML}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  } catch (error) {
    showToast(error.message || "PDF export failed");
  } finally {
    report.remove();
  }
}

function buildPdfReportNode(conversation) {
  const node = document.createElement("article");
  node.className = "pdf-report";
  node.dir = /[؀-ۿ]/.test(JSON.stringify(conversation.messages || [])) ? "auto" : "ltr";

  const modeLabel = MODE_META[conversation.mode]?.label || "General Chat";
  const title = conversation.title || makeTitle(conversation.messages?.find(m => m.role === "user")?.content || "Nexus report");
  const generated = new Date().toLocaleString();

  node.innerHTML = `
    <header class="pdf-header">
      <div class="pdf-brand">Nx</div>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(modeLabel)} · Generated ${escapeHtml(generated)}</p>
      </div>
    </header>
    <section class="pdf-meta-box">
      Educational clinical decision support only. Confirm critical decisions with trusted references and local protocols.
    </section>
    <main class="pdf-body"></main>
  `;

  const body = node.querySelector(".pdf-body");
  (conversation.messages || []).forEach(message => {
    const block = document.createElement("section");
    block.className = `pdf-message ${message.role === "assistant" ? "assistant" : "user"}`;
    const label = message.role === "assistant" ? "Nexus" : "User";
    const attachments = message.attachments?.length
      ? `<div class="pdf-attachments"><b>Attachments:</b> ${escapeHtml(message.attachments.map(f => f.name).join(", "))}</div>`
      : "";
    block.innerHTML = `
      <div class="pdf-role">${label}</div>
      <div class="pdf-content">${message.role === "assistant" ? renderMarkdown(message.content) : escapeHtml(message.content).replace(/\n/g, "<br>")}</div>
      ${attachments}
    `;
    body.appendChild(block);
  });

  return node;
}

function safeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70) || "nexus-chat";
}

function isMobileSidebar() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function openSidebar() {
  document.body.classList.remove("sidebar-collapsed");
  if (isMobileSidebar()) {
    els.sidebar.classList.add("open");
    els.sidebarBackdrop.classList.add("show");
  }
}

function closeSidebar() {
  if (isMobileSidebar()) {
    els.sidebar.classList.remove("open");
    els.sidebarBackdrop.classList.remove("show");
  } else {
    document.body.classList.add("sidebar-collapsed");
  }
}

function closeSidebarAfterNavigation() {
  if (isMobileSidebar()) closeSidebar();
}

async function handleNewChatClick() {
  await createNewConversation(true);
  closeSidebarAfterNavigation();
  setTimeout(() => els.messageInput.focus(), 80);
}

function bindEvents() {
  els.loginTab?.addEventListener("click", () => setAuthMode("login"));
  els.signupTab?.addEventListener("click", () => setAuthMode("signup"));
  els.authForm?.addEventListener("submit", handleAuthSubmit);
  els.logoutBtn?.addEventListener("click", logout);
  els.newChatBtn.addEventListener("click", handleNewChatClick);
  els.newChatTopBtn?.addEventListener("click", handleNewChatClick);
  els.themeToggleBtn.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
  els.openSidebarBtn.addEventListener("click", openSidebar);
  els.closeSidebarBtn.addEventListener("click", closeSidebar);
  els.sidebarBackdrop.addEventListener("click", closeSidebar);
  els.toggleArchiveBtn.addEventListener("click", async () => {
    state.showArchived = !state.showArchived;
    await loadConversations();
    state.currentConversationId = state.conversations[0]?.id || null;
    renderAll();
  });
  document.querySelectorAll(".mode-btn, .mode-chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectMode(btn.dataset.mode);
      closeSidebarAfterNavigation();
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
  els.quickAccessAddBtn?.addEventListener("click", () => openQuickAccessModal(null, { title: "", tags: [], content: "" }));
  els.quickAccessSearch?.addEventListener("input", () => {
    state.quickAccessSearch = els.quickAccessSearch.value || "";
    renderQuickAccess();
  });
  els.quickAccessSaveBtn?.addEventListener("click", saveQuickAccessFromModal);
  els.quickAccessCancelBtn?.addEventListener("click", closeQuickAccessModal);
  els.quickAccessDeleteBtn?.addEventListener("click", () => deleteQuickAccessNote());
  els.workShelfClearBtn?.addEventListener("click", clearWorkShelf);
  document.querySelectorAll("[data-work-generate]").forEach(btn => {
    btn.addEventListener("click", () => generateFromWorkShelf(btn.dataset.workGenerate));
  });
  els.quickAccessModal?.addEventListener("click", (event) => {
    if (event.target === els.quickAccessModal) closeQuickAccessModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.quickAccessModal?.classList.contains("hidden")) closeQuickAccessModal();
  });

  els.messages.addEventListener("scroll", () => {
    if (updateActiveRailFromViewport.raf) cancelAnimationFrame(updateActiveRailFromViewport.raf);
    updateActiveRailFromViewport.raf = requestAnimationFrame(updateActiveRailFromViewport);
  }, { passive: true });
  document.addEventListener("click", (event) => {
    if (state.dropdown && !event.target.closest(".dropdown") && !event.target.closest(".history-dots")) closeDropdown();
  });
}

async function init() {
  bindEvents();
  applyTheme(localStorage.getItem("nexus_theme") || "light");

  const params = new URLSearchParams(location.search);
  if (params.get("reset") === "1") {
    Object.keys(localStorage).filter(k => k.startsWith("nexus_")).forEach(k => localStorage.removeItem(k));
  }
  const shareId = params.get("share");
  if (shareId) {
    await loadSharedConversation(shareId);
    return;
  }

  const localUser = getLocalJson(localUserKey(), null) || buildLocalUser("local@nexus.app", "Nexus User");
  setLocalJson(localUserKey(), localUser);
  await enterApp(localUser);
}

init().catch(async error => {
  console.error(error);
  try {
    Object.keys(localStorage).filter(k => k.startsWith("nexus_conversations_")).forEach(k => localStorage.removeItem(k));
    const fallbackUser = buildLocalUser("local@nexus.app", "Nexus User");
    setLocalJson(localUserKey(), fallbackUser);
    await enterApp(fallbackUser);
    showToast("Recovered workspace after startup issue.");
  } catch (recoveryError) {
    console.error(recoveryError);
    showToast((error.message || "App failed to start") + " — " + (recoveryError.message || "recovery failed"));
  }
});

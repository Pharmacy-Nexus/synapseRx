// ============ SAFETY PANEL ============
function showSafetyPanel(alerts = []) {
  const panel = document.getElementById('safetyPanel');
  const content = document.getElementById('safetyContent');
  if (!alerts.length) {
    panel.classList.remove('open');
    return;
  }
  
  content.innerHTML = alerts.map(alert => `
    <div class="safety-item ${alert.severity === 'critical' ? 'danger' : ''}">
      <div class="safety-item-title">${escapeHtml(alert.title)}</div>
      <div class="safety-item-desc">${escapeHtml(alert.description)}</div>
      ${alert.action ? `<div class="safety-item-action">Action: ${escapeHtml(alert.action)}</div>` : ''}
    </div>
  `).join('');
  
  panel.classList.add('open');
}

// ============ IMPROVED MESSAGE RENDERING ============
function createMessageNode(role, content, options = {}) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  if (Number.isInteger(options.index)) row.dataset.messageIndex = String(options.index);

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'assistant' ? 'Nx' : 'You';

  const wrapper = document.createElement('div');
  wrapper.className = 'message-content-wrapper';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  
  const cleanContent = role === 'assistant' ? cleanAssistantVisibleContent(content) : content;
  bubble.innerHTML = role === 'assistant' 
    ? renderMarkdown(cleanContent) 
    : escapeHtml(content).replace(/\n/g, '<br>');

  // Attachments
  if (options.attachments?.length && role === 'user') {
    const chips = document.createElement('div');
    chips.className = 'attachment-chips';
    options.attachments.forEach(file => {
      const chip = document.createElement('span');
      chip.className = 'attachment-chip';
      chip.textContent = `📎 ${file.name}`;
      chips.appendChild(chip);
    });
    bubble.appendChild(chips);
  }

  // Related questions
  if (role === 'assistant') {
    const related = ensureRelatedQuestions(content);
    if (related.length) {
      const rq = document.createElement('div');
      rq.className = 'related-questions';
      rq.innerHTML = `<div class="related-title">Suggested follow-ups</div>`;
      const chips = document.createElement('div');
      chips.className = 'related-chips';
      related.forEach(q => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'related-chip';
        btn.textContent = q;
        btn.addEventListener('click', () => {
          els.messageInput.value = q;
          autoGrow(els.messageInput);
          els.messageInput.focus();
        });
        chips.appendChild(btn);
      });
      rq.appendChild(chips);
      bubble.appendChild(rq);
    }
    
    // Disclaimer
    if (!options.hideDisclaimer && options.mode !== 'general_chat') {
      const disc = document.createElement('div');
      disc.className = 'message-disclaimer';
      disc.textContent = 'Educational clinical decision support only. Verify with trusted references and local protocols.';
      bubble.appendChild(disc);
    }
  }

  wrapper.appendChild(bubble);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'message-action-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyMessageText(cleanContent));
  actions.appendChild(copyBtn);

  if (role === 'user' && Number.isInteger(options.index) && !state.readOnlyShare) {
    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startEditMessage(options.index));
    actions.appendChild(editBtn);
  }
  
  wrapper.appendChild(actions);

  row.appendChild(avatar);
  row.appendChild(wrapper);
  return row;
}

// ============ IMPROVED THINKING STATE ============
function showThinkingState(container) {
  const box = document.createElement('div');
  box.className = 'thinking-container';
  box.innerHTML = `
    <div class="thinking-pulse"></div>
    <span class="thinking-text">Analyzing</span>
    <span class="thinking-timer" id="thinkingTimer">0.0s</span>
  `;
  container.innerHTML = '';
  container.appendChild(box);
  
  const start = performance.now();
  const timer = setInterval(() => {
    const el = document.getElementById('thinkingTimer');
    if (el) el.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
  }, 100);
  
  return () => clearInterval(timer);
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
  // Escape to stop generation
  if (e.key === 'Escape' && state.isGenerating) {
    state.abortController?.abort();
  }
  
  // Ctrl/Cmd + Shift + N for new chat
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    handleNewChatClick();
  }
  
  // Ctrl/Cmd + / to focus input
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    els.messageInput.focus();
  }
  
  // Ctrl/Cmd + B to toggle sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    if (els.sidebar.classList.contains('open')) {
      closeSidebarMobile();
    } else {
      openSidebarMobile();
    }
  }
});

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

// ============ IMPROVED STREAMING ============
async function streamAssistantReply(conversation) {
  const assistantMessage = {
    role: 'assistant',
    content: '',
    mode: state.activeMode,
    created_at: nowIso(),
    thinkingTime: 0
  };
  conversation.messages.push(assistantMessage);
  renderCurrentConversation();

  const inner = document.getElementById('messagesInner');
  const assistantRow = inner.lastElementChild;
  const assistantBody = assistantRow.querySelector('.message-bubble');
  
  const clearTimer = showThinkingState(assistantBody);

  state.isGenerating = true;
  document.body.classList.add('generating');
  state.abortController = new AbortController();
  els.stopBtn.classList.remove('hidden');
  els.sendBtn.disabled = true;

  const start = performance.now();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.activeMode,
        modeInstruction: MODE_META[state.activeMode].prompt,
        messages: conversation.messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
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

    // Check for safety flags in headers (if backend supports it)
    const safetyHeader = response.headers.get('X-Nexus-Safety');
    if (safetyHeader) {
      try {
        const safetyAlerts = JSON.parse(safetyHeader);
        showSafetyPanel(safetyAlerts);
      } catch {}
    }

    clearTimer();
    assistantMessage.thinkingTime = (performance.now() - start) / 1000;
    
    const contentType = response.headers.get('content-type') || '';
    if (response.body && !contentType.includes('application/json')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        assistantMessage.content = buffer;
        assistantBody.innerHTML = renderMarkdown(cleanAssistantVisibleContent(buffer));
        assistantBody.classList.add('streaming');
        scrollToBottom();
      }
      
      assistantBody.classList.remove('streaming');
    } else {
      const data = await response.json();
      assistantMessage.content = data.reply || '### Temporary response issue\nPlease resend the question.';
      assistantMessage.thinkingTime = (performance.now() - start) / 1000;
      assistantBody.innerHTML = renderMarkdown(cleanAssistantVisibleContent(assistantMessage.content));
    }

    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, conversation);
    
    // Check local safety after response
    checkLocalSafety(assistantMessage.content);
    
  } catch (error) {
    clearTimer();
    if (error.name === 'AbortError') {
      assistantMessage.content = assistantMessage.content.trim() 
        ? assistantMessage.content + '\n\n> [!NOTE] Generation stopped by user.'
        : 'Generation stopped by user.';
    } else {
      assistantMessage.content = `### Connection error\n${error.message}`;
    }
    assistantMessage.thinkingTime = (performance.now() - start) / 1000;
    finalizeAssistantNode(assistantBody, assistantMessage);
    await persistConversation(conversation, conversation).catch(console.error);
  } finally {
    state.isGenerating = false;
    document.body.classList.remove('generating');
    state.abortController = null;
    els.stopBtn.classList.add('hidden');
    els.sendBtn.disabled = false;
  }
}

// ============ LOCAL SAFETY CHECK ============
function checkLocalSafety(text) {
  const alerts = [];
  const lower = text.toLowerCase();
  
  // Check for emergency keywords without proper escalation
  const emergencyTerms = ['unconscious', 'seizure', 'severe bleeding', 'chest pain', 'anaphylaxis'];
  if (emergencyTerms.some(t => lower.includes(t)) && !lower.includes('emergency') && !lower.includes('urgent')) {
    alerts.push({
      severity: 'critical',
      title: 'Emergency Context Detected',
      description: 'The response may involve emergency symptoms. Ensure proper escalation is mentioned.',
      action: 'Add emergency disclaimer'
    });
  }
  
  // Check for warfarin without INR mention
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

// ============ IMPROVED WELCOME ============
function welcomeNode() {
  const node = document.createElement('div');
  node.className = 'welcome-screen';
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
  
  node.querySelectorAll('[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      els.messageInput.value = btn.dataset.prompt;
      autoGrow(els.messageInput);
      els.messageInput.focus();
    });
  });
  
  return node;
}

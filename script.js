// Load WebLLM only when the user actually sends a message. If the CDN is unreachable,
// the rest of the interface still initializes and can show a useful error.
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const STORAGE_KEY = 'peykan-ai-chats-v1';
const ACTIVE_KEY = 'peykan-ai-active-v1';
const $ = (id) => document.getElementById(id);
const ui = {
  sidebar: $('sidebar'), chatList: $('chatList'), chatCount: $('chatCount'), newChat: $('newChat'),
  clearAll: $('clearAll'), conversation: $('conversation'), welcome: $('welcome'), messages: $('messages'),
  input: $('messageInput'), send: $('sendButton'), modelButton: $('modelButton'), modelStatus: $('modelStatus'),
  loadingPanel: $('loadingPanel'), loadingTitle: $('loadingTitle'), loadingDetail: $('loadingDetail'),
  loadPercent: $('loadPercent'), progressBar: $('progressBar'), toast: $('toast'), modal: $('modalBackdrop'),
  loadModelButton: $('loadModelButton'), modalClose: $('modalClose'), modalCancel: $('modalCancel'),
  openSidebar: $('openSidebar'), closeSidebar: $('closeSidebar')
};
let engine = null;
let loadingPromise = null;
let busy = false;
let toastTimer;
let chats = loadChats();
let activeId = localStorage.getItem(ACTIVE_KEY);

function faNumber(n) { return String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]); }
function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function loadChats() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  } catch { showToast('فضای ذخیره‌سازی مرورگر پر شده است.'); }
}
function currentChat() { return chats.find(chat => chat.id === activeId); }
function createChat() {
  const chat = { id: makeId(), title: 'گفتگوی جدید', messages: [], updatedAt: Date.now() };
  chats.unshift(chat); activeId = chat.id; saveChats(); renderChatList(); renderMessages(); closeSidebar(); ui.input.focus();
}
function showToast(message) {
  ui.toast.textContent = message; ui.toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3200);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function renderChatList() {
  ui.chatCount.textContent = faNumber(chats.length);
  ui.chatList.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement('div'); empty.className = 'empty-chats';
    empty.style.cssText = 'padding:14px 8px;color:#65748c;font-size:11px;line-height:2';
    empty.textContent = 'هنوز گفتگویی نداری. یک گفتگوی جدید بساز.'; ui.chatList.append(empty); return;
  }
  [...chats].sort((a,b) => b.updatedAt - a.updatedAt).forEach(chat => {
    const row = document.createElement('div'); row.className = `chat-item${chat.id === activeId ? ' active' : ''}`; row.tabIndex = 0; row.setAttribute('role','button');
    const symbol = document.createElement('span'); symbol.className = 'chat-symbol'; symbol.textContent = '◷';
    const title = document.createElement('span'); title.className = 'chat-title'; title.textContent = chat.title || 'گفتگوی جدید'; title.title = title.textContent;
    const del = document.createElement('button'); del.className = 'delete-chat'; del.type = 'button'; del.textContent = '×'; del.title = 'حذف گفتگو'; del.setAttribute('aria-label','حذف گفتگو');
    del.addEventListener('click', event => { event.stopPropagation(); deleteChat(chat.id); });
    row.append(symbol,title,del); row.addEventListener('click', () => switchChat(chat.id));
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); switchChat(chat.id); } });
    ui.chatList.append(row);
  });
}
function switchChat(id) { activeId = id; saveChats(); renderChatList(); renderMessages(); closeSidebar(); }
function deleteChat(id) {
  chats = chats.filter(chat => chat.id !== id);
  if (activeId === id) activeId = chats[0]?.id || null;
  if (!activeId && chats.length === 0) { localStorage.removeItem(ACTIVE_KEY); }
  saveChats(); renderChatList(); renderMessages(); showToast('گفتگو حذف شد.');
}
function renderMessages() {
  const chat = currentChat(); ui.messages.replaceChildren();
  const isEmpty = !chat || !chat.messages.length;
  ui.welcome.classList.toggle('hidden', !isEmpty);
  if (chat) chat.messages.forEach(message => appendMessage(message.role, message.content, false));
  ui.conversation.scrollTop = ui.conversation.scrollHeight;
}
function appendMessage(role, content, shouldScroll = true) {
  const wrap = document.createElement('article'); wrap.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'user' ? 'ش' : 'پ';
  const contentBox = document.createElement('div'); contentBox.className = 'message-content';
  const name = document.createElement('div'); name.className = 'message-name'; name.textContent = role === 'user' ? 'شما' : 'پیکان';
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = content;
  contentBox.append(name,bubble);
  if (role === 'assistant' && content) {
    const actions = document.createElement('div'); actions.className = 'message-actions';
    const copy = document.createElement('button'); copy.className = 'tiny-action'; copy.textContent = 'کپی پاسخ';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(content); showToast('پاسخ کپی شد.'); } catch { showToast('کپی خودکار در این مرورگر در دسترس نیست.'); } });
    actions.append(copy); contentBox.append(actions);
  }
  wrap.append(avatar,contentBox); ui.messages.append(wrap);
  if (shouldScroll) ui.conversation.scrollTop = ui.conversation.scrollHeight;
  return { wrap, bubble };
}
function addTyping() {
  const item = appendMessage('assistant',''); item.bubble.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>'; return item;
}
function updateModelStatus(text, ready = false) { ui.modelStatus.textContent = text; ui.modelButton.classList.toggle('ready', ready); }
function showLoading(show) { ui.loadingPanel.classList.toggle('hidden', !show); }
function updateProgress(report) {
  const progress = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
  ui.loadPercent.textContent = `${faNumber(progress)}٪`; ui.progressBar.style.width = `${progress}%`;
  if (report.text) ui.loadingDetail.textContent = report.text;
  if (progress >= 100) { ui.loadingTitle.textContent = 'آماده‌سازی نهایی…'; }
}
async function loadModel() {
  if (engine) return engine;
  if (loadingPromise) return loadingPromise;
  if (!('gpu' in navigator)) {
    showToast('این مرورگر از WebGPU پشتیبانی نمی‌کند. با نسخهٔ جدید Chrome یا Edge امتحان کن.');
    throw new Error('WebGPU is not supported in this browser.');
  }
  ui.modal.classList.add('hidden'); showLoading(true); ui.send.disabled = true;
  ui.loadingTitle.textContent = 'در حال دانلود و آماده‌سازی مدل…';
  ui.loadingDetail.textContent = 'بار اول ممکن است چندصد مگابایت دانلود شود؛ صفحه را نبند.';
  updateModelStatus('در حال بارگذاری مدل…');
  loadingPromise = (async () => {
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm');
      engine = await CreateMLCEngine(MODEL_ID, { initProgressCallback: updateProgress });
      updateModelStatus('مدل آماده است', true); ui.loadingTitle.textContent = 'هوش مصنوعی آماده است';
      ui.loadingDetail.textContent = 'مدل در این مرورگر آمادهٔ پاسخ‌گویی است.'; ui.progressBar.style.width = '100%'; ui.loadPercent.textContent = '۱۰۰٪';
      setTimeout(() => showLoading(false), 900); showToast('پیکان آمادهٔ گفتگو است!'); return engine;
    } catch (error) {
      engine = null; updateModelStatus('بارگذاری ناموفق'); showLoading(false);
      showToast('بارگذاری مدل انجام نشد. اینترنت، دسترسی به CDN و سازگاری WebGPU را بررسی کن.'); throw error;
    } finally { loadingPromise = null; ui.send.disabled = false; }
  })();
  return loadingPromise;
}
async function sendMessage(text) {
  const prompt = text.trim(); if (!prompt || busy) return;
  let chat = currentChat(); if (!chat) { createChat(); chat = currentChat(); }
  chat.messages.push({ role: 'user', content: prompt });
  if (chat.messages.filter(m => m.role === 'user').length === 1) chat.title = prompt.slice(0, 34);
  chat.updatedAt = Date.now(); saveChats(); renderChatList();
  ui.welcome.classList.add('hidden'); appendMessage('user', prompt); ui.input.value = ''; resizeInput();
  busy = true; ui.send.disabled = true; const typing = addTyping();
  try {
    if (!engine) await loadModel();
    const history = chat.messages.slice(-16).map(message => ({ role: message.role, content: message.content }));
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'نام تو پیکان است. دستیار هوش مصنوعی مفید و صمیمی هستی. به فارسی روان پاسخ بده مگر اینکه کاربر زبان دیگری بخواهد. پاسخ‌ها را روشن، دقیق و متناسب با پرسش بنویس. اگر مطمئن نیستی، صادقانه بگو. از ادعای دسترسی به اینترنت یا اطلاعات زنده خودداری کن.' },
        ...history
      ], temperature: 0.7, max_tokens: 700
    });
    const answer = response.choices?.[0]?.message?.content?.trim() || 'نتوانستم پاسخ مناسبی بسازم؛ لطفاً دوباره امتحان کن.';
    typing.wrap.remove(); chat.messages.push({ role: 'assistant', content: answer }); chat.updatedAt = Date.now(); saveChats();
    appendMessage('assistant', answer); renderChatList();
  } catch (error) {
    typing.wrap.remove();
    const reason = !('gpu' in navigator) ? 'مرورگر فعلی از اجرای این مدل پشتیبانی نمی‌کند. از نسخهٔ جدید Chrome یا Edge استفاده کن.' : 'مدل بارگذاری نشد؛ ممکن است اینترنت، دسترسی به منبع دانلود مدل، یا حافظهٔ دستگاه مشکل داشته باشد. صفحه را تازه کن و دوباره امتحان کن.';
    appendMessage('assistant', `متأسفانه نتوانستم پاسخ را تولید کنم.\n\n${reason}\n\nاگر این اولین پیام توست، از دکمهٔ وضعیت مدل در بالای صفحه هم می‌توانی بارگذاری را دوباره امتحان کنی.`);
    console.error('PEYKAN AI error:', error);
  } finally { busy = false; ui.send.disabled = false; ui.input.focus(); }
}
function resizeInput() { ui.input.style.height = 'auto'; ui.input.style.height = `${Math.min(ui.input.scrollHeight,140)}px`; }
function closeSidebar() { ui.sidebar.classList.remove('open'); }

ui.newChat.addEventListener('click', createChat);
ui.clearAll.addEventListener('click', () => {
  if (!chats.length) { showToast('گفتگویی برای پاک‌کردن وجود ندارد.'); return; }
  if (confirm('همهٔ گفتگوها از این مرورگر پاک شوند؟ این کار قابل بازگشت نیست.')) {
    chats = []; activeId = null; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(ACTIVE_KEY); renderChatList(); renderMessages(); showToast('همهٔ گفتگوها پاک شدند.');
  }
});
ui.send.addEventListener('click', () => sendMessage(ui.input.value));
ui.input.addEventListener('input', resizeInput);
ui.input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(ui.input.value); } });
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { ui.input.value = button.dataset.prompt || ''; resizeInput(); sendMessage(ui.input.value); }));
ui.modelButton.addEventListener('click', () => { if (engine) { showToast('مدل آماده است و روی دستگاهت اجرا می‌شود.'); return; } ui.modal.classList.remove('hidden'); });
ui.loadModelButton.addEventListener('click', () => loadModel().catch(() => {}));
ui.modalClose.addEventListener('click', () => ui.modal.classList.add('hidden'));
ui.modalCancel.addEventListener('click', () => ui.modal.classList.add('hidden'));
ui.modal.addEventListener('click', event => { if (event.target === ui.modal) ui.modal.classList.add('hidden'); });
ui.openSidebar.addEventListener('click', () => ui.sidebar.classList.add('open'));
ui.closeSidebar.addEventListener('click', closeSidebar);

if (!activeId || !chats.some(chat => chat.id === activeId)) activeId = chats[0]?.id || null;
if (!activeId && chats.length === 0) { const first = { id: makeId(), title: 'گفتگوی جدید', messages: [], updatedAt: Date.now() }; chats = [first]; activeId = first.id; saveChats(); }
renderChatList(); renderMessages();

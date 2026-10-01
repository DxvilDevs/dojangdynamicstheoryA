const CONFIG = window.APP_CONFIG || {};
const hasSupabaseConfig = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT');
const supabaseClient = hasSupabaseConfig ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

const state = {
  view: 'dashboard',
  officialDecks: [],
  officialCategories: [],
  officialCards: [],
  personalDecks: [],
  personalCards: [],
  currentDeck: null,
  flashcards: [],
  flashIndex: 0,
  flipped: false,
  session: null,
  reviewStats: JSON.parse(localStorage.getItem('bb_review_stats') || '{}'),
  localProgress: JSON.parse(localStorage.getItem('bb_local_progress') || '{}'),
  loading: false
};

const content = document.getElementById('content');
const crumbs = document.getElementById('crumbs');
const sidebarProgress = document.getElementById('sidebarProgress');
const sidebarProgressFill = document.getElementById('sidebarProgressFill');
const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  Object.assign(el.style, {
    position:'fixed', right:'18px', bottom:'18px', zIndex:200,
    padding:'12px 14px', borderRadius:'12px', background:'#11151d',
    border:'1px solid #323948', color:'#fff', boxShadow:'0 18px 50px rgba(0,0,0,.45)', fontSize:'13px'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function setView(view, data = {}) {
  state.view = view;
  state.currentDeck = data.deck || state.currentDeck;
  state.flashcards = data.cards || state.flashcards;
  state.flashIndex = 0;
  state.flipped = false;
  render();
  document.getElementById('sidebar')?.classList.remove('open');
}

async function init() {
  bindShellEvents();
  if (!supabaseClient) {
    renderConfigError();
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    loadPersonal().then(render);
    updateAuthButton();
  });
  await Promise.all([loadOfficial(), loadPersonal()]);
  render();
}

function bindShellEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.getElementById('mobileMenu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('authButton').addEventListener('click', () => state.session ? setView('my-decks') : openAuthModal());
}

function updateAuthButton() {
  const btn = document.getElementById('authButton');
  btn.textContent = state.session ? 'My account' : 'Create your own deck';
}

async function loadOfficial() {
  const { data: decks, error: decksError } = await supabaseClient
    .from('official_decks').select('*').order('sort_order');
  if (decksError) throw decksError;
  state.officialDecks = decks || [];
  const { data: cats, error: catsError } = await supabaseClient
    .from('official_categories').select('*').order('sort_order');
  if (catsError) throw catsError;
  state.officialCategories = cats || [];
  const { data: cards, error: cardsError } = await supabaseClient
    .from('official_cards').select('*').order('sort_order');
  if (cardsError) throw cardsError;
  state.officialCards = cards || [];
}

async function loadPersonal() {
  if (!state.session) {
    state.personalDecks = [];
    state.personalCards = [];
    return;
  }
  const { data: decks, error: decksError } = await supabaseClient.from('personal_decks').select('*').order('created_at', { ascending:false });
  if (decksError) throw decksError;
  state.personalDecks = decks || [];
  const { data: cards, error: cardsError } = await supabaseClient.from('personal_cards').select('*').order('created_at', { ascending:false });
  if (cardsError) throw cardsError;
  state.personalCards = cards || [];
}

function render() {
  updateNavState();
  updateSidebarProgress();
  updateAuthButton();
  const labels = { dashboard:'Dashboard', study:'Study', official:'Official decks', 'my-decks':'My stuff', progress:'Progress' };
  crumbs.textContent = labels[state.view] || 'Black Belt Study';
  switch(state.view) {
    case 'dashboard': content.innerHTML = dashboardView(); break;
    case 'study': content.innerHTML = studyView(); break;
    case 'official': content.innerHTML = officialView(); break;
    case 'my-decks': content.innerHTML = myDecksView(); break;
    case 'progress': content.innerHTML = progressView(); break;
    default: content.innerHTML = dashboardView();
  }
  bindDynamicEvents();
}

function updateNavState() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
}

function updateSidebarProgress() {
  const total = state.officialCards.length + state.personalCards.length;
  let known = 0;
  const allCards = [...state.officialCards, ...state.personalCards];
  allCards.forEach(card => { if (state.reviewStats[card.id] === 'known') known += 1; });
  const pct = total ? Math.round(known / total * 100) : 0;
  sidebarProgress.textContent = `${pct}%`;
  sidebarProgressFill.style.width = `${pct}%`;
}

function dashboardView() {
  const due = getDueCards().length;
  const total = state.officialCards.length + state.personalCards.length;
  const learned = [...state.officialCards, ...state.personalCards].filter(c => state.reviewStats[c.id] === 'known').length;
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="eyebrow">Your black belt revision hub</div>
        <h1>Learn the theory.<br/>Own the grading.</h1>
        <p class="lede">Your official syllabus stays curated and protected, while your own notes and custom decks live alongside it.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="start-review">Start review</button>
          <button class="btn" data-action="view-official">Browse official decks</button>
        </div>
      </div>
      <div class="card hero-side">
        <div class="metric"><div class="metric-label">Cards available</div><div class="metric-value">${total}</div></div>
        <div class="metric"><div class="metric-label">Marked known</div><div class="metric-value">${learned}</div></div>
        <div class="metric"><div class="metric-label">Due to review</div><div class="metric-value">${due}</div></div>
      </div>
    </section>

    <div class="section-head"><div><h2>Official syllabus</h2><p>Only your curated content appears here.</p></div><button class="ghost-btn btn-small" data-action="view-official">See all</button></div>
    <div class="grid">${state.officialDecks.map(deckCard).join('')}</div>

    <div class="section-head"><div><h2>Quick actions</h2><p>Study without getting lost in the app.</p></div></div>
    <div class="grid">
      ${quickCard('🧠','Review weak areas','Bring back the terms you keep missing.','start-review')}
      ${quickCard('✚','Add your own','Make a private deck for anything outside the official syllabus.','my-decks')}
      ${quickCard('🤖','AI study coach','Summarise official theory into quick revision notes.','ai-summary')}
    </div>
  `;
}

function quickCard(icon, title, text, action) {
  return `<div class="deck-card"><div class="deck-icon">${icon}</div><div><h3>${title}</h3><p>${text}</p></div><div class="deck-card-footer"><span class="badge">Study</span><button class="btn btn-small" data-action="${action}">Open</button></div></div>`;
}

function deckCard(deck) {
  const cards = state.officialCards.filter(card => card.deck_id === deck.id).length;
  return `<div class="deck-card">
    <div class="deck-icon">${esc(deck.icon)}</div>
    <div><h3>${esc(deck.name)}</h3><p>${esc(deck.description || 'Official Black Belt revision content.')}</p></div>
    <div class="deck-card-footer"><span class="badge">${cards} cards</span><button class="btn btn-small" data-deck-id="${deck.id}" data-source="official">Study</button></div>
  </div>`;
}

function studyView() {
  if (!state.flashcards.length) {
    return `<section><div class="section-head"><div><h2>Study</h2><p>Pick a deck to begin.</p></div></div><div class="grid">${[...state.officialDecks].map(deckCard).join('') || '<div class="empty">No official cards yet.</div>'}</div></section>`;
  }
  const card = state.flashcards[state.flashIndex];
  const isLast = state.flashIndex >= state.flashcards.length - 1;
  const known = state.reviewStats[card.id] === 'known';
  const missed = state.reviewStats[card.id] === 'missed';
  return `
    <section class="flashcard-shell">
      <div class="section-head"><div><div class="eyebrow">Study session</div><h2>${esc(state.currentDeck?.name || 'Review')}</h2><p>${state.flashIndex + 1} / ${state.flashcards.length}</p></div><button class="ghost-btn btn-small" data-action="exit-study">Exit</button></div>
      <div class="flashcard">
        <div class="flashcard-top"><span>${esc(card.category || 'Revision')}</span><span>${known ? '✓ Known' : missed ? '× Review again' : 'Unrated'}</span></div>
        <div class="flashcard-main">
          ${state.flipped ? `<div><h2>${esc(card.back)}</h2>${card.notes ? `<p>${esc(card.notes)}</p>` : ''}</div>` : `<div><div class="eyebrow">Term / question</div><h2>${esc(card.front)}</h2><p>Tap reveal when you're ready.</p></div>`}
        </div>
        <div>
          <div class="flashcard-actions"><button class="btn btn-primary" data-action="flip-card">${state.flipped ? 'Hide answer' : 'Reveal answer'}</button></div>
          ${state.flipped ? `<div class="rating-row"><button class="btn rating" data-rate="missed">✕ Missed</button><button class="btn rating" data-rate="known">✓ Knew it</button></div>` : ''}
        </div>
      </div>
      ${isLast ? '<div class="success" style="margin-top:12px">Last card. Rating this card will finish the session.</div>' : ''}
    </section>`;
}

function officialView() {
  return `<section><div class="section-head"><div><div class="eyebrow">Curated content</div><h2>Official decks</h2><p>This content is controlled from the content manager and cannot be edited by normal users.</p></div></div>
    <div class="grid">${state.officialDecks.map(deckCard).join('') || '<div class="empty">Your official library is empty. Add content in Content manager.</div>'}</div>
  </section>`;
}

function myDecksView() {
  if (!state.session) {
    return `<section><div class="hero-card"><div class="eyebrow">Personal library</div><h2>Keep your own material alongside the official syllabus.</h2><p class="lede">Create private decks for anything your instructor teaches that isn't already in the official library.</p><div class="hero-actions"><button class="btn btn-primary" data-action="open-auth">Sign in / create account</button><button class="btn" data-action="view-official">Back to official</button></div><div class="notice" style="margin-top:18px">You don't need an account to study the official content.</div></div></section>`;
  }
  return `<section><div class="section-head"><div><div class="eyebrow">Private library</div><h2>My stuff</h2><p>Only you can change these decks and cards.</p></div><button class="btn btn-primary" data-action="new-deck">+ New deck</button></div>
    <div class="grid">${state.personalDecks.map(personalDeckCard).join('') || '<div class="empty">No personal decks yet. Create one for your own terminology, class notes or extra grading questions.</div>'}</div>
    <div class="section-head"><div><h2>Account</h2><p>${esc(state.session.user.email || '')}</p></div><button class="ghost-btn btn-small" data-action="sign-out">Sign out</button></div>
  </section>`;
}

function personalDeckCard(deck) {
  const cards = state.personalCards.filter(c => c.deck_id === deck.id).length;
  return `<div class="deck-card"><div class="deck-icon">＋</div><div><h3>${esc(deck.name)}</h3><p>${esc(deck.description || 'Your personal revision deck.')}</p></div><div class="deck-card-footer"><span class="badge">${cards} cards</span><div class="list-actions"><button class="btn btn-small" data-personal-deck="${deck.id}">Study</button><button class="icon-btn" title="Manage deck" data-manage-deck="${deck.id}">⚙</button></div></div></div>`;
}

function progressView() {
  const all = [...state.officialCards, ...state.personalCards];
  const known = all.filter(c => state.reviewStats[c.id] === 'known').length;
  const missed = all.filter(c => state.reviewStats[c.id] === 'missed').length;
  const total = all.length;
  const pct = total ? Math.round(known / total * 100) : 0;
  const weak = all.filter(c => state.reviewStats[c.id] === 'missed').slice(0, 12);
  return `<section><div class="section-head"><div><div class="eyebrow">Your revision data</div><h2>Progress</h2><p>Ratings are stored locally on this device for now, so your revision history works without forcing account creation.</p></div></div>
    <div class="stat-grid">
      <div class="stat-card"><span>Overall known</span><strong>${pct}%</strong></div>
      <div class="stat-card"><span>Known cards</span><strong>${known}</strong></div>
      <div class="stat-card"><span>Missed cards</span><strong>${missed}</strong></div>
    </div>
    <div class="section-head"><div><h2>Weak areas</h2><p>These are your recent missed cards.</p></div><button class="btn btn-small" data-action="start-review">Review weak areas</button></div>
    <div class="list">${weak.length ? weak.map(c => `<div class="list-row"><div class="list-main"><strong>${esc(c.front)}</strong><span>${esc(c.back)}</span></div><span class="badge">Missed</span></div>`).join('') : '<div class="empty">Nothing marked as missed yet.</div>'}</div>
  </section>`;
}

function bindDynamicEvents() {
  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', handleAction));
  document.querySelectorAll('[data-deck-id]').forEach(el => el.addEventListener('click', () => startDeck(el.dataset.deckId, el.dataset.source)));
  document.querySelectorAll('[data-personal-deck]').forEach(el => el.addEventListener('click', () => startPersonalDeck(el.dataset.personalDeck)));
  document.querySelectorAll('[data-manage-deck]').forEach(el => el.addEventListener('click', () => managePersonalDeck(el.dataset.manageDeck)));
  document.querySelectorAll('[data-rate]').forEach(el => el.addEventListener('click', () => rateCard(el.dataset.rate)));
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (action === 'start-review') return startReview();
  if (action === 'view-official') return setView('official');
  if (action === 'my-decks') return setView('my-decks');
  if (action === 'study') return setView('study');
  if (action === 'ai-summary') return openAISummaryModal();
  if (action === 'open-auth') return openAuthModal();
  if (action === 'new-deck') return openDeckModal();
  if (action === 'sign-out') return signOut();
  if (action === 'flip-card') { state.flipped = !state.flipped; render(); }
  if (action === 'exit-study') { state.flashcards = []; setView('dashboard'); }
}

function startReview() {
  const due = getDueCards();
  const cards = due.length ? due : [...state.officialCards, ...state.personalCards].slice(0, 20);
  state.currentDeck = { name: due.length ? 'Review due cards' : 'Quick review' };
  state.flashcards = cards;
  state.flashIndex = 0;
  state.flipped = false;
  setView('study');
}

function getDueCards() {
  const all = [...state.officialCards, ...state.personalCards];
  const missed = all.filter(c => state.reviewStats[c.id] === 'missed');
  const unseen = all.filter(c => !state.reviewStats[c.id]);
  return [...missed, ...unseen].slice(0, 20);
}

function startDeck(deckId, source) {
  const isOfficial = source === 'official';
  const deck = isOfficial ? state.officialDecks.find(d => d.id === deckId) : state.personalDecks.find(d => d.id === deckId);
  if (!deck) return;
  const cards = isOfficial ? state.officialCards.filter(c => c.deck_id === deckId) : state.personalCards.filter(c => c.deck_id === deckId);
  state.currentDeck = deck;
  state.flashcards = cards;
  state.flashIndex = 0;
  state.flipped = false;
  setView('study');
}

function startPersonalDeck(deckId) { startDeck(deckId, 'personal'); }

function rateCard(rating) {
  const card = state.flashcards[state.flashIndex];
  if (!card) return;
  state.reviewStats[card.id] = rating;
  localStorage.setItem('bb_review_stats', JSON.stringify(state.reviewStats));
  if (state.flashIndex >= state.flashcards.length - 1) {
    toast('Session complete.');
    state.flashcards = [];
    setView('dashboard');
    return;
  }
  state.flashIndex += 1;
  state.flipped = false;
  render();
}

function openAuthModal() {
  modal.innerHTML = `
    <div class="modal-head"><div><h2>Create your own decks</h2><p>The official syllabus is public. An account is only needed to save and sync your personal decks.</p></div><button class="icon-btn" data-close-modal>✕</button></div>
    <form class="form" id="authForm">
      <div class="field"><label>Email</label><input id="authEmail" type="email" required autocomplete="email" placeholder="you@example.com" /></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters" /></div>
      <div id="authMessage"></div>
      <div class="modal-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Create / sign in</button></div>
    </form>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const message = document.getElementById('authMessage');
    message.innerHTML = '';
    const signIn = await supabaseClient.auth.signInWithPassword({ email, password });
    if (!signIn.error) { closeModal(); toast('Signed in.'); return; }
    const signUp = await supabaseClient.auth.signUp({ email, password });
    if (signUp.error) {
      message.innerHTML = `<div class="error">${esc(signUp.error.message)}</div>`;
      return;
    }
    if (!signUp.data.session) {
      message.innerHTML = `<div class="success">Account created. Check your email if Supabase email confirmation is enabled.</div>`;
      return;
    }
    closeModal(); toast('Account created.');
  });
}

async function signOut() {
  await supabaseClient.auth.signOut();
  toast('Signed out.');
  setView('dashboard');
}

function openDeckModal() {
  if (!state.session) return openAuthModal();
  modal.innerHTML = `<div class="modal-head"><div><h2>New personal deck</h2><p>This deck belongs only to your account.</p></div><button class="icon-btn" data-close-modal>✕</button></div>
  <form class="form" id="deckForm"><div class="field"><label>Deck name</label><input required id="deckName" placeholder="My Korean terms" /></div><div class="field"><label>Description</label><textarea id="deckDescription" placeholder="What are you keeping here?"></textarea></div><div id="deckMessage"></div><div class="modal-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Create deck</button></div></form>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  document.getElementById('deckForm').addEventListener('submit', createDeck);
}

async function createDeck(e) {
  e.preventDefault();
  const name = document.getElementById('deckName').value.trim();
  const description = document.getElementById('deckDescription').value.trim();
  const { error } = await supabaseClient.from('personal_decks').insert({ user_id: state.session.user.id, name, description });
  if (error) {
    document.getElementById('deckMessage').innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  await loadPersonal();
  closeModal();
  toast('Deck created.');
  setView('my-decks');
}

function managePersonalDeck(deckId) {
  const deck = state.personalDecks.find(d => d.id === deckId);
  if (!deck) return;
  const cards = state.personalCards.filter(c => c.deck_id === deckId);
  modal.innerHTML = `<div class="modal-head"><div><h2>${esc(deck.name)}</h2><p>Add the material you want to own and revise.</p></div><button class="icon-btn" data-close-modal>✕</button></div>
    <div class="list" style="max-height:320px;overflow:auto">${cards.map(c => `<div class="list-row"><div class="list-main"><strong>${esc(c.front)}</strong><span>${esc(c.back)}</span></div><button class="btn btn-small btn-danger" data-delete-card="${c.id}">Delete</button></div>`).join('') || '<div class="empty">No cards yet.</div>'}</div>
    <div class="section-head" style="margin-top:20px"><div><h3>Add a card</h3><p>Romanised term → English meaning works well for Korean.</p></div></div>
    <form class="form" id="cardForm"><div class="field"><label>Front / term</label><input id="cardFront" required placeholder="Charyot" /></div><div class="field"><label>Back / answer</label><input id="cardBack" required placeholder="Attention" /></div><div class="field"><label>Notes (optional)</label><textarea id="cardNotes" placeholder="Extra memory cue"></textarea></div><div id="cardMessage"></div><div class="modal-actions"><button type="button" class="btn" data-close-modal>Close</button><button class="btn btn-primary">Add card</button></div></form>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  modal.querySelectorAll('[data-delete-card]').forEach(btn => btn.addEventListener('click', () => deletePersonalCard(btn.dataset.deleteCard, deckId)));
  document.getElementById('cardForm').addEventListener('submit', e => addPersonalCard(e, deckId));
}

async function addPersonalCard(e, deckId) {
  e.preventDefault();
  const payload = {
    user_id: state.session.user.id,
    deck_id: deckId,
    front: document.getElementById('cardFront').value.trim(),
    back: document.getElementById('cardBack').value.trim(),
    notes: document.getElementById('cardNotes').value.trim()
  };
  const { error } = await supabaseClient.from('personal_cards').insert(payload);
  if (error) {
    document.getElementById('cardMessage').innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  await loadPersonal();
  managePersonalDeck(deckId);
  toast('Card added.');
}

async function deletePersonalCard(cardId, deckId) {
  const { error } = await supabaseClient.from('personal_cards').delete().eq('id', cardId).eq('user_id', state.session.user.id);
  if (error) return toast(error.message, 'error');
  delete state.reviewStats[cardId];
  localStorage.setItem('bb_review_stats', JSON.stringify(state.reviewStats));
  await loadPersonal();
  managePersonalDeck(deckId);
}

function closeModal() { modalBackdrop.classList.add('hidden'); modal.innerHTML = ''; }
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });


async function openAISummaryModal() {
  const theoryDeck = state.officialDecks.find(d => d.slug === 'theory') || state.officialDecks.find(d => /theory/i.test(d.name));
  const cards = theoryDeck ? state.officialCards.filter(c => c.deck_id === theoryDeck.id) : [];
  if (!cards.length) {
    toast('Add official theory content first.', 'error');
    return;
  }
  modal.innerHTML = `<div class="modal-head"><div><h2>AI study coach</h2><p>Turns your official theory into quick revision notes. It only receives the content already stored in your official deck.</p></div><button class="icon-btn" data-close-modal>✕</button></div>
    <div class="field"><label>Style</label><select id="aiStyle"><option>Quick revision notes</option><option>Explain simply</option><option>Exam-style key points</option><option>Memory cues</option></select></div>
    <div id="aiMsg" class="notice">${cards.length} official theory cards will be summarised.</div>
    <div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn btn-primary" id="runAISummary">Generate summary</button></div>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  document.getElementById('runAISummary').addEventListener('click', async () => {
    const msg = document.getElementById('aiMsg');
    msg.className = 'notice';
    msg.textContent = 'Generating…';
    const source = cards.map(c => `${c.front} — ${c.back}${c.notes ? ` (${c.notes})` : ''}`).join('\n');
    const url = `${CONFIG.SUPABASE_URL}/functions/v1/ai-summarise`;
    const response = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':CONFIG.SUPABASE_ANON_KEY},
      body:JSON.stringify({title:theoryDeck.name,content:source,style:document.getElementById('aiStyle').value})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || data.error) {
      msg.className = 'error';
      msg.textContent = data.error || 'AI summary could not be generated.';
      return;
    }
    msg.className = 'success';
    msg.innerHTML = `<strong>Summary</strong><div style="margin-top:8px;white-space:pre-wrap;line-height:1.65">${esc(data.summary)}</div>`;
    document.getElementById('runAISummary').remove();
  });
}

function renderConfigError() {
  content.innerHTML = `<section><div class="hero-card"><div class="eyebrow">Setup needed</div><h2>Connect this site to Supabase</h2><p class="lede">Open <strong>config.js</strong> and replace the placeholder Supabase URL and anon key. Then upload the folder to GitHub Pages.</p><div class="notice" style="margin-top:18px">Run <strong>schema.sql</strong> in Supabase first. Never put a service-role key into GitHub Pages.</div></div></section>`;
}

init().catch(err => {
  console.error(err);
  content.innerHTML = `<section><div class="error">Could not load the study library: ${esc(err.message)}</div></section>`;
});

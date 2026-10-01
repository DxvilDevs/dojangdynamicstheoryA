const CONFIG = window.APP_CONFIG || {};
const configured = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_URL.includes('YOUR_'));
const sb = configured ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

const els = {
  content: document.getElementById('content'),
  crumbs: document.getElementById('crumbs'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  modal: document.getElementById('modal'),
  authButton: document.getElementById('authButton'),
  avatarButton: document.getElementById('avatarButton'),
  sidebarProgress: document.getElementById('sidebarProgress'),
  sidebarProgressFill: document.getElementById('sidebarProgressFill'),
  sidebarProgressText: document.getElementById('sidebarProgressText'),
  installButton: document.getElementById('installButton')
};

const STORE_KEY = 'dojang-dynamics-progress-v1';
const SAMPLE_DECKS = [
  { id: 'sample-korean', slug: 'korean-terminology', name: 'Korean terminology', description: 'Romanised Korean terms and their English meanings.', icon: '✦', sort_order: 10, is_published: true, sample: true },
  { id: 'sample-theory', slug: 'theory', name: 'Theory', description: 'Black Belt theory, principles and knowledge.', icon: '◈', sort_order: 20, is_published: true, sample: true },
  { id: 'sample-techniques', slug: 'techniques', name: 'Techniques', description: 'Technique names, meanings and revision prompts.', icon: '△', sort_order: 30, is_published: true, sample: true },
  { id: 'sample-patterns', slug: 'patterns', name: 'Patterns', description: 'Pattern knowledge and grading prompts.', icon: '◇', sort_order: 40, is_published: true, sample: true }
];
const SAMPLE_CARDS = [
  { id: 'sample-1', deck_id: 'sample-korean', category: 'Commands', front: 'Charyot', back: 'Attention', notes: '' },
  { id: 'sample-2', deck_id: 'sample-korean', category: 'Commands', front: 'Kyong Ye', back: 'Bow', notes: '' },
  { id: 'sample-3', deck_id: 'sample-korean', category: 'Commands', front: 'Joonbi', back: 'Ready', notes: '' },
  { id: 'sample-4', deck_id: 'sample-korean', category: 'General', front: 'Kihap', back: 'Spirit shout', notes: '' },
  { id: 'sample-5', deck_id: 'sample-korean', category: 'General', front: 'Kyorugi', back: 'Sparring', notes: '' }
];

const state = {
  view: 'dashboard',
  session: null,
  officialDecks: [...SAMPLE_DECKS],
  officialCategories: [],
  officialCards: [...SAMPLE_CARDS],
  personalDecks: [],
  personalCards: [],
  progress: loadProgress(),
  currentDeck: null,
  currentCards: [],
  flashIndex: 0,
  flipped: false,
  category: 'All',
  search: '',
  installPrompt: null
};

function esc(value) {
  return String(value ?? '').replace(/[&<>\'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveProgress() { localStorage.setItem(STORE_KEY, JSON.stringify(state.progress)); }
function now() { return Date.now(); }
function getAllCards() { return [...state.officialCards, ...state.personalCards]; }
function getProgress(cardId) { return state.progress[cardId] || { status: 'new', due: 0, reviews: 0, streak: 0 }; }
function isDue(card) { const p = getProgress(card.id); return p.status !== 'known' || !p.due || p.due <= now(); }
function getDueCards() { return getAllCards().filter(isDue); }
function knownCount() { return getAllCards().filter(card => getProgress(card.id).status === 'known').length; }
function overallPercent() { const total = getAllCards().length; return total ? Math.round(knownCount() / total * 100) : 0; }
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function randomTone(i) { return ['tone-lilac','tone-blue','tone-mint','tone-peach'][i % 4]; }

async function init() {
  bindGlobalEvents();
  setupPWA();
  if (sb) {
    const { data } = await sb.auth.getSession();
    state.session = data.session;
    sb.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      loadPersonal().finally(render);
    });
    await loadOfficial();
    await loadPersonal();
  } else {
    showConfigHint();
  }
  routeFromHash();
  render();
}

function showConfigHint() {
  // Deliberately non-blocking. The front end remains usable with the sample content until Supabase is configured.
  console.info('Dojang Dynamics: configure config.js to connect Supabase.');
}

async function loadOfficial() {
  if (!sb) return;
  const [d, c, cards] = await Promise.all([
    sb.from('official_decks').select('*').eq('is_published', true).order('sort_order'),
    sb.from('official_categories').select('*').order('sort_order'),
    sb.from('official_cards').select('*').order('sort_order')
  ]);
  if (!d.error) state.officialDecks = d.data || [];
  if (!c.error) state.officialCategories = c.data || [];
  if (!cards.error) state.officialCards = (cards.data || []).map(card => ({ ...card, category: state.officialCategories.find(c => c.id === card.category_id)?.name || '' }));
}

async function loadPersonal() {
  state.personalDecks = [];
  state.personalCards = [];
  if (!sb || !state.session) return;
  const [d, c] = await Promise.all([
    sb.from('personal_decks').select('*').order('created_at', { ascending: false }),
    sb.from('personal_cards').select('*').order('created_at', { ascending: false })
  ]);
  if (!d.error) state.personalDecks = d.data || [];
  if (!c.error) state.personalCards = c.data || [];
}

function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      state.view = viewButton.dataset.view;
      state.category = 'All';
      state.search = '';
      state.currentDeck = null;
      state.currentCards = [];
      state.flipped = false;
      location.hash = state.view;
      render();
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) handleAction(action.dataset.action, action);
    const deckBtn = event.target.closest('[data-study-deck]');
    if (deckBtn) startDeck(deckBtn.dataset.studyDeck, deckBtn.dataset.source || 'official');
    const personalBtn = event.target.closest('[data-personal-study]');
    if (personalBtn) startDeck(personalBtn.dataset.personalStudy, 'personal');
  });

  document.addEventListener('input', event => {
    if (event.target.matches('#deckSearch')) {
      state.search = event.target.value;
      renderOfficialOnly();
    }
  });
  window.addEventListener('hashchange', routeFromHash);
  els.modalBackdrop.addEventListener('click', e => { if (e.target === els.modalBackdrop) closeModal(); });
}

function routeFromHash() {
  const view = (location.hash || '#dashboard').replace('#','');
  const allowed = ['dashboard','study','official','my-decks','progress'];
  state.view = allowed.includes(view) ? view : 'dashboard';
  render();
}

function setupPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    els.installButton.hidden = false;
  });
  els.installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    els.installButton.hidden = true;
  });
}

function render() {
  updateNav();
  updateProgress();
  updateAccount();
  const labels = { dashboard:'Overview', study:'Study', official:'Official decks', 'my-decks':'My stuff', progress:'Progress' };
  els.crumbs.textContent = labels[state.view] || 'Overview';
  if (state.view === 'dashboard') els.content.innerHTML = dashboardView();
  if (state.view === 'study') els.content.innerHTML = studyView();
  if (state.view === 'official') els.content.innerHTML = officialView();
  if (state.view === 'my-decks') els.content.innerHTML = myDecksView();
  if (state.view === 'progress') els.content.innerHTML = progressView();
  bindViewEvents();
}

function updateNav() {
  document.querySelectorAll('.nav-item, .mobile-nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
}
function updateProgress() {
  const pct = overallPercent();
  els.sidebarProgress.textContent = `${pct}%`;
  els.sidebarProgressFill.style.width = `${pct}%`;
  const total = getAllCards().length;
  const due = getDueCards().length;
  els.sidebarProgressText.textContent = !total ? 'Add your official syllabus' : `${due} card${due === 1 ? '' : 's'} ready to review`;
}
function updateAccount() {
  if (state.session) {
    const email = state.session.user.email || '';
    els.authButton.textContent = 'Account';
    els.avatarButton.textContent = initials(email);
  } else {
    els.authButton.textContent = 'My account';
    els.avatarButton.textContent = 'DD';
  }
}
function initials(text) {
  const part = String(text || 'DD').split('@')[0];
  return part.slice(0,2).toUpperCase();
}

function dashboardView() {
  const total = getAllCards().length;
  const due = getDueCards().length;
  const known = knownCount();
  const decks = state.officialDecks.slice().sort((a,b) => a.sort_order - b.sort_order);
  return `
    <section class="dashboard-hero">
      <div class="hero-main">
        <div class="eyebrow">Black Belt revision hub</div>
        <h1>Train your knowledge.<br><span class="gradient-text">Own your grading.</span></h1>
        <p class="lede">Dojang Dynamics keeps your official syllabus clear, your flashcards focused and your progress easy to see.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="start-review">Start review <span aria-hidden="true">→</span></button>
          <button class="btn" data-action="browse-decks">Explore decks</button>
        </div>
        <div class="stats-strip">
          <div><div class="metric-label">Cards available</div><div class="metric-value">${total}</div></div>
          <div><div class="metric-label">Marked known</div><div class="metric-value">${known}</div></div>
          <div><div class="metric-label">Ready today</div><div class="metric-value">${due}</div></div>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-side-head"><div><div class="eyebrow">Today's focus</div><div class="focus-title">${due ? 'Keep your streak moving' : 'You are all caught up'}</div><div class="focus-sub">${due ? `${Math.min(due,12)} cards are ready for review.` : 'Come back later for your next review.'}</div></div><span class="mini-pill">${Math.round((known / Math.max(total,1))*100)}% known</span></div>
        <div class="focus-art"><div class="ring"></div><div class="orb"></div><div class="tile"></div></div>
        <div class="focus-copy"><div class="eyebrow">Next session</div><div style="font-size:11px;color:var(--muted);margin-top:3px">Korean terms, theory and whatever you last found tricky.</div></div>
      </div>
    </section>

    <div class="section-head"><div class="section-copy"><h2>Official syllabus</h2><p>Curated by you. Organised into the exact decks and categories you want.</p></div><button class="ghost-btn btn-small" data-action="browse-decks">View all</button></div>
    <div class="grid">${decks.map((deck,i) => deckCard(deck,i)).join('') || '<div class="empty">Your official content is empty. Add it from Content manager.</div>'}</div>

    <div class="section-head"><div class="section-copy"><h2>Make revision feel simple</h2><p>Everything here works without an account until you choose to create your own material.</p></div></div>
    <div class="quick-grid">
      <div class="quick-card lilac"><div class="quick-card-art">✦</div><div><h3>Fast flashcard review</h3><p>Reveal answers, mark what you knew and let the app bring missed cards back around.</p><button class="btn btn-small" data-action="start-review">Review now</button></div></div>
      <div class="quick-card blue"><div class="quick-card-art">＋</div><div><h3>Keep your own material</h3><p>Create private decks for instructor notes, extra terms or anything outside the official syllabus.</p><button class="btn btn-small" data-action="open-my-stuff">Open My Stuff</button></div></div>
    </div>`;
}

function deckCard(deck, index) {
  const cards = state.officialCards.filter(c => c.deck_id === deck.id).length;
  return `<article class="deck-card ${randomTone(index)}"><div class="deck-icon">${esc(deck.icon || '◈')}</div><div><h3>${esc(deck.name)}</h3><p>${esc(deck.description || 'Official Black Belt revision content.')}</p></div><div class="deck-card-footer"><span class="badge">${cards} card${cards===1?'':'s'}</span><button class="btn btn-small" data-study-deck="${deck.id}" data-source="official">Study →</button></div></article>`;
}

function officialView() {
  const decks = state.officialDecks;
  const filtered = decks.filter(d => !state.search || `${d.name} ${d.description}`.toLowerCase().includes(state.search.toLowerCase()));
  return `<section>
    <div class="section-head"><div class="section-copy"><div class="eyebrow">Curated content</div><h2>Official decks</h2><p>Your official grading material stays protected. Normal users can study it but cannot change it.</p></div></div>
    <div class="filter-bar"><div class="search-wrap"><input id="deckSearch" type="search" placeholder="Search decks..." value="${esc(state.search)}" /></div><button class="filter-chip active">${decks.length} decks</button></div>
    <div class="grid">${filtered.map((d,i)=>deckCard(d,i)).join('') || '<div class="empty">No decks match that search.</div>'}</div>
  </section>`;
}

function renderOfficialOnly() {
  const shell = document.querySelector('.grid');
  if (!shell || state.view !== 'official') return render();
  const filtered = state.officialDecks.filter(d => !state.search || `${d.name} ${d.description}`.toLowerCase().includes(state.search.toLowerCase()));
  shell.innerHTML = filtered.map((d,i)=>deckCard(d,i)).join('') || '<div class="empty">No decks match that search.</div>';
}

function studyView() {
  if (!state.currentDeck || !state.currentCards.length) {
    return `<section>
      <div class="section-head"><div class="section-copy"><div class="eyebrow">Study mode</div><h2>Choose where to start</h2><p>Study your official decks without logging in. Your progress is saved locally on this device.</p></div></div>
      <div class="grid">${state.officialDecks.map((d,i)=>deckCard(d,i)).join('')}${state.session ? state.personalDecks.map((d,i)=>personalDeckCard(d,i)).join('') : ''}</div>
      ${!configured ? '<div class="notice" style="margin-top:14px">Supabase is not configured yet, so this preview is using the starter cards. Add your project details to config.js when you are ready.</div>' : ''}
    </section>`;
  }

  const card = state.currentCards[state.flashIndex];
  const progress = Math.round(((state.flashIndex + 1) / state.currentCards.length) * 100);
  const known = getProgress(card.id).status === 'known';
  const missed = getProgress(card.id).status === 'missed';
  return `<section class="flashcard-shell">
    <div class="study-meta"><div><div class="eyebrow">${esc(card.category || 'Revision')}</div><h2 style="margin-top:4px">${esc(state.currentDeck.name)}</h2></div><div style="display:flex;align-items:center;gap:10px"><div class="study-progress"><div style="width:${progress}%"></div></div><span class="badge">${state.flashIndex+1} / ${state.currentCards.length}</span><button class="ghost-btn btn-small" data-action="exit-study">Exit</button></div></div>
    <div class="flashcard">
      <div class="flashcard-top"><span>${known ? '✓ Previously known' : missed ? '↻ Bring this one back' : 'New card'}</span><span>${esc(card.category || 'General')}</span></div>
      <div class="flashcard-main">
        ${state.flipped ? `<div class="answer-card"><div class="answer-kicker">Answer</div><h2>${esc(card.back)}</h2>${card.notes ? `<p>${esc(card.notes)}</p>` : ''}</div>` : `<div><div class="answer-kicker">Term / question</div><h2>${esc(card.front)}</h2><p>Take a second. Say the answer before you reveal it.</p></div>`}
      </div>
      <div>${state.flipped ? `<div class="rating-row"><button class="btn rating" data-rate="missed">✕ Missed</button><button class="btn rating" data-rate="hard">~ Nearly</button><button class="btn btn-primary rating" data-rate="known">✓ Knew it</button></div>` : `<div class="hero-actions" style="justify-content:center;margin-top:0"><button class="btn btn-primary" data-action="flip-card">Reveal answer</button></div>`}</div>
    </div>
  </section>`;
}

function myDecksView() {
  if (!state.session) {
    return `<section><div class="hero-main"><div class="eyebrow">Private library</div><h2 style="font-size:35px;margin-top:9px">Build the deck your grading actually needs.</h2><p class="lede" style="margin-top:13px">Official content stays curated. Your own decks are private to your account and can hold instructor notes, extra Korean terms or anything else you want to remember.</p><div class="hero-actions"><button class="btn btn-primary" data-action="open-auth">Sign in / create account</button><button class="btn" data-action="browse-decks">Back to official</button></div><div class="notice" style="margin-top:18px">No account is needed to study the official syllabus.</div></div></section>`;
  }
  return `<section>
    <div class="section-head"><div class="section-copy"><div class="eyebrow">Private library</div><h2>My stuff</h2><p>Only you can edit these decks and cards.</p></div><button class="btn btn-primary" data-action="new-deck">+ New deck</button></div>
    <div class="grid">${state.personalDecks.map((d,i)=>personalDeckCard(d,i)).join('') || '<div class="empty">No personal decks yet. Make one for your own terminology or class notes.</div>'}</div>
    <div class="section-head"><div class="section-copy"><h2>Account</h2><p>${esc(state.session.user.email || '')}</p></div><button class="ghost-btn btn-small" data-action="sign-out">Sign out</button></div>
  </section>`;
}

function personalDeckCard(deck,index) {
  const count = state.personalCards.filter(c=>c.deck_id===deck.id).length;
  return `<article class="deck-card ${randomTone(index)}"><div class="deck-icon">＋</div><div><h3>${esc(deck.name)}</h3><p>${esc(deck.description || 'Personal revision deck.')}</p></div><div class="deck-card-footer"><span class="badge">${count} card${count===1?'':'s'}</span><div class="list-actions"><button class="btn btn-small" data-personal-study="${deck.id}">Study</button><button class="icon-btn" title="Manage deck" data-manage-personal="${deck.id}">⚙</button></div></div></article>`;
}

function progressView() {
  const all = getAllCards();
  const known = all.filter(c=>getProgress(c.id).status==='known').length;
  const missed = all.filter(c=>getProgress(c.id).status==='missed').length;
  const hard = all.filter(c=>getProgress(c.id).status==='hard').length;
  const pct = all.length ? Math.round(known/all.length*100) : 0;
  const weak = all.filter(c=>['missed','hard'].includes(getProgress(c.id).status)).slice(0,10);
  return `<section>
    <div class="section-head"><div class="section-copy"><div class="eyebrow">Revision data</div><h2>Your progress</h2><p>Progress is saved locally so you can use the official study experience without making an account.</p></div></div>
    <div class="stat-grid">
      <div class="stat-card"><span>Overall known</span><strong>${pct}%</strong><div class="stat-bar"><i style="width:${pct}%"></i></div></div>
      <div class="stat-card"><span>Known cards</span><strong>${known}</strong><div class="stat-bar"><i style="width:${all.length?known/all.length*100:0}%"></i></div></div>
      <div class="stat-card"><span>Needs another pass</span><strong>${missed+hard}</strong><div class="stat-bar"><i style="width:${all.length?(missed+hard)/all.length*100:0}%"></i></div></div>
    </div>
    <div class="section-head"><div class="section-copy"><h2>Weak areas</h2><p>Terms you have marked missed or nearly there.</p></div><button class="btn btn-small" data-action="review-weak">Review these</button></div>
    <div class="list">${weak.length ? weak.map(c=>`<div class="list-row"><div class="list-main"><strong>${esc(c.front)}</strong><span>${esc(c.back)}</span></div><span class="badge">${esc(getProgress(c.id).status)}</span></div>`).join('') : '<div class="empty">Nothing is flagged right now. Nice.</div>'}</div>
  </section>`;
}

function bindViewEvents() {
  document.querySelectorAll('[data-rate]').forEach(btn=>btn.addEventListener('click',()=>rateCard(btn.dataset.rate)));
  document.querySelectorAll('[data-manage-personal]').forEach(btn=>btn.addEventListener('click',()=>openManageDeck(btn.dataset.managePersonal)));
  const manageDeckBtn = document.querySelector('[data-action="manage-account"]');
  if (manageDeckBtn) manageDeckBtn.addEventListener('click', ()=>{});
}

async function handleAction(action, element) {
  if (action === 'start-review') return startReview();
  if (action === 'review-weak') return startWeakReview();
  if (action === 'flip-card') { state.flipped = !state.flipped; return render(); }
  if (action === 'exit-study') { state.currentDeck = null; state.currentCards = []; state.flipped=false; state.view='study'; location.hash='study'; return render(); }
  if (action === 'browse-decks') { state.view='official'; location.hash='official'; return render(); }
  if (action === 'open-my-stuff') { state.view='my-decks'; location.hash='my-decks'; return render(); }
  if (action === 'open-auth') return openAuthModal();
  if (action === 'new-deck') return openPersonalDeckModal();
  if (action === 'sign-out') { if (sb) await sb.auth.signOut(); return; }
  if (action === 'open-account') return openAccountModal();
  if (action === 'add-card') return openPersonalCardModal(element.dataset.deckId);
  if (action === 'manage-deck') return openManageDeck(element.dataset.deckId);
}

function startReview() {
  const cards = getDueCards().slice(0,12);
  if (!cards.length) {
    state.view='progress'; location.hash='progress'; render();
    return;
  }
  state.currentDeck = { name: 'Daily review' };
  state.currentCards = shuffle(cards);
  state.flashIndex=0; state.flipped=false; state.view='study'; location.hash='study'; render();
}
function startWeakReview() {
  const cards = getAllCards().filter(c=>['missed','hard'].includes(getProgress(c.id).status)).slice(0,12);
  if (!cards.length) return startReview();
  state.currentDeck={name:'Weak areas'}; state.currentCards=shuffle(cards); state.flashIndex=0; state.flipped=false; state.view='study'; location.hash='study'; render();
}
function startDeck(id, source='official') {
  const cards = source === 'personal' ? state.personalCards.filter(c=>c.deck_id===id) : state.officialCards.filter(c=>c.deck_id===id);
  const deck = source === 'personal' ? state.personalDecks.find(d=>d.id===id) : state.officialDecks.find(d=>d.id===id);
  if (!deck || !cards.length) {
    if (source === 'personal') openManageDeck(id);
    return;
  }
  state.currentDeck=deck;
  state.currentCards=shuffle(cards);
  state.flashIndex=0; state.flipped=false; state.view='study'; location.hash='study'; render();
}
function shuffle(items) { return [...items].sort(()=>Math.random()-0.5); }

function rateCard(rating) {
  const card = state.currentCards[state.flashIndex];
  if (!card) return;
  const old = getProgress(card.id);
  const delay = rating === 'known' ? (old.streak >= 2 ? 7 : old.reviews ? 3 : 1) * 24*60*60*1000 : rating === 'hard' ? 8*60*60*1000 : 10*60*1000;
  state.progress[card.id] = {
    status: rating,
    due: now() + delay,
    reviews: (old.reviews || 0) + 1,
    streak: rating === 'known' ? (old.streak || 0) + 1 : 0,
    lastReviewed: now()
  };
  saveProgress();
  if (state.flashIndex >= state.currentCards.length - 1) {
    state.currentDeck = null; state.currentCards=[]; state.flipped=false;
    renderSessionComplete();
    return;
  }
  state.flashIndex += 1; state.flipped=false; render();
}

function renderSessionComplete() {
  const finished = state.currentCards.length;
  state.currentDeck=null; state.currentCards=[]; state.view='dashboard'; location.hash='dashboard';
  render();
  openModal(`<div class="modal-head"><div><div class="eyebrow">Session complete</div><h2>Nice work.</h2><p>You just finished ${finished} cards. Your next review will bring back the ones that need another pass.</p></div><button class="icon-btn" data-close>✕</button></div><div class="notice">Your progress is saved on this device.</div><div class="modal-actions"><button class="btn" data-close>Done</button><button class="btn btn-primary" id="modalReviewAgain">Review again</button></div>`);
  document.getElementById('modalReviewAgain')?.addEventListener('click',()=>{ closeModal(); startReview(); });
}

function openAuthModal() {
  if (!sb) {
    openModal(`<div class="modal-head"><div><h2>Supabase not connected</h2><p>Add your project URL and anon key to <code>config.js</code> before creating private decks.</p></div><button class="icon-btn" data-close>✕</button></div><div class="notice">The official study experience works without an account. Only personal decks require Supabase Auth.</div><div class="modal-actions"><button class="btn btn-primary" data-close>Done</button></div>`);
    return;
  }
  openModal(authModal('signin'));
}
function authModal(mode) {
  const signup = mode === 'signup';
  return `<div class="modal-head"><div><div class="eyebrow">Private library</div><h2>${signup?'Create your account':'Welcome back'}</h2><p>${signup?'Make private decks for your own grading material.':'Sign in to access your private decks.'}</p></div><button class="icon-btn" data-close>✕</button></div>
    <form class="form" id="authForm">
      <div class="field"><label>Email</label><input id="authEmail" type="email" required autocomplete="email"></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" required minlength="6" autocomplete="${signup?'new-password':'current-password'}"></div>
      <div id="authMsg"></div>
      <div class="modal-actions"><button type="button" class="btn" id="switchAuth">${signup?'I already have an account':'Create account'}</button><button class="btn btn-primary">${signup?'Create account':'Sign in'}</button></div>
    </form>`;
}
function attachAuth(mode) {
  document.getElementById('switchAuth')?.addEventListener('click',()=>{ openModal(authModal(mode==='signup'?'signin':'signup')); attachAuth(mode==='signup'?'signin':'signup'); });
  document.getElementById('authForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const msg = document.getElementById('authMsg');
    msg.innerHTML='';
    const result = mode === 'signup' ? await sb.auth.signUp({email,password}) : await sb.auth.signInWithPassword({email,password});
    if (result.error) { msg.innerHTML=`<div class="error">${esc(result.error.message)}</div>`; return; }
    closeModal();
    if (mode === 'signup' && !result.data.session) {
      openModal(`<div class="modal-head"><div><h2>Check your email</h2><p>Supabase may require email confirmation before your account can sign in.</p></div></div><div class="notice">Once confirmed, come back to Dojang Dynamics and sign in.</div><div class="modal-actions"><button class="btn btn-primary" data-close>Done</button></div>`);
    }
  });
}
function openModal(html) {
  els.modal.innerHTML=html; els.modalBackdrop.classList.remove('hidden'); els.modalBackdrop.setAttribute('aria-hidden','false');
  els.modal.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',closeModal));
  if (els.modal.querySelector('#authForm')) attachAuth(els.modal.querySelector('#switchAuth')?.textContent==='Create account' ? 'signin' : 'signup');
}
function closeModal() { els.modalBackdrop.classList.add('hidden'); els.modalBackdrop.setAttribute('aria-hidden','true'); els.modal.innerHTML=''; }

function openAccountModal() {
  if (!state.session) return openAuthModal();
  openModal(`<div class="modal-head"><div><div class="eyebrow">Account</div><h2>${esc(state.session.user.email || 'Signed in')}</h2><p>Your account is only used for private decks. Official study still works without login.</p></div><button class="icon-btn" data-close>✕</button></div><div class="modal-actions"><button class="btn btn-danger" id="modalSignOut">Sign out</button><button class="btn btn-primary" data-close>Done</button></div>`);
  document.getElementById('modalSignOut')?.addEventListener('click', async()=>{ await sb.auth.signOut(); closeModal(); });
}

function openPersonalDeckModal(deck=null) {
  if (!state.session) return openAuthModal();
  openModal(`<div class="modal-head"><div><h2>${deck?'Edit':'Create'} personal deck</h2><p>Private to your account.</p></div><button class="icon-btn" data-close>✕</button></div>
    <form class="form" id="personalDeckForm"><div class="field"><label>Name</label><input id="pdName" required value="${esc(deck?.name||'')}"></div><div class="field"><label>Description</label><textarea id="pdDesc">${esc(deck?.description||'')}</textarea></div><div id="pdMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  document.getElementById('personalDeckForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const payload={name:document.getElementById('pdName').value.trim(),description:document.getElementById('pdDesc').value.trim()};
    const result=deck ? await sb.from('personal_decks').update(payload).eq('id',deck.id) : await sb.from('personal_decks').insert({...payload,user_id:state.session.user.id});
    if(result.error){document.getElementById('pdMsg').innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return;}
    closeModal(); await loadPersonal(); render();
  });
}

function openManageDeck(id) {
  const deck=state.personalDecks.find(d=>d.id===id); if(!deck) return;
  const cards=state.personalCards.filter(c=>c.deck_id===id);
  openModal(`<div class="modal-head"><div><div class="eyebrow">Private deck</div><h2>${esc(deck.name)}</h2><p>${cards.length} card${cards.length===1?'':'s'}</p></div><button class="icon-btn" data-close>✕</button></div>
    <div class="toolbar-row"><button class="btn btn-primary btn-small" id="manageAddCard">+ Add card</button><button class="btn btn-small" id="manageEditDeck">Edit deck</button><button class="btn btn-danger btn-small" id="manageDeleteDeck">Delete</button></div>
    <div class="list" style="margin-top:14px">${cards.map(c=>`<div class="list-row"><div class="list-main"><strong>${esc(c.front)}</strong><span>${esc(c.back)}</span></div><div class="list-actions"><button class="btn btn-small" data-edit-personal-card="${c.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-personal-card="${c.id}">Delete</button></div></div>`).join('') || '<div class="empty">No cards yet.</div>'}</div>`);
  document.getElementById('manageAddCard')?.addEventListener('click',()=>openPersonalCardModal(id));
  document.getElementById('manageEditDeck')?.addEventListener('click',()=>openPersonalDeckModal(deck));
  document.getElementById('manageDeleteDeck')?.addEventListener('click',async()=>{ if(!confirm('Delete this private deck and its cards?'))return; const {error}=await sb.from('personal_decks').delete().eq('id',id); if(error)return alert(error.message); await loadPersonal(); closeModal(); render(); });
  document.querySelectorAll('[data-edit-personal-card]').forEach(btn=>btn.addEventListener('click',()=>openPersonalCardModal(id, cards.find(c=>c.id===btn.dataset.editPersonalCard))));
  document.querySelectorAll('[data-delete-personal-card]').forEach(btn=>btn.addEventListener('click',async()=>{ if(!confirm('Delete this card?'))return; const {error}=await sb.from('personal_cards').delete().eq('id',btn.dataset.deletePersonalCard); if(error)return alert(error.message); await loadPersonal(); openManageDeck(id); }));
}

function openPersonalCardModal(deckId, card=null) {
  if (!state.session) return openAuthModal();
  openModal(`<div class="modal-head"><div><h2>${card?'Edit':'Add'} card</h2><p>For Korean terms, use romanised Korean on the front and English on the back.</p></div><button class="icon-btn" data-close>✕</button></div>
    <form class="form" id="personalCardForm"><div class="field"><label>Front</label><input id="pcFront" required value="${esc(card?.front||'')}"></div><div class="field"><label>Back</label><input id="pcBack" required value="${esc(card?.back||'')}"></div><div class="field"><label>Notes</label><textarea id="pcNotes">${esc(card?.notes||'')}</textarea></div><div class="field"><label>Category</label><input id="pcCategory" value="${esc(card?.category||'')}"></div><div id="pcMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
  document.getElementById('personalCardForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const payload={front:document.getElementById('pcFront').value.trim(),back:document.getElementById('pcBack').value.trim(),notes:document.getElementById('pcNotes').value.trim(),category:document.getElementById('pcCategory').value.trim()};
    let result;
    if(card) result=await sb.from('personal_cards').update(payload).eq('id',card.id);
    else result=await sb.from('personal_cards').insert({...payload,user_id:state.session.user.id,deck_id:deckId});
    if(result.error){document.getElementById('pcMsg').innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return;}
    closeModal(); await loadPersonal(); render(); openManageDeck(deckId);
  });
}

els.authButton.addEventListener('click', openAccountModal);
els.avatarButton.addEventListener('click', openAccountModal);

init().catch(error => {
  console.error(error);
  els.content.innerHTML=`<section><div class="error">Something went wrong loading Dojang Dynamics: ${esc(error.message)}</div></section>`;
});

const CONFIG = window.APP_CONFIG || {};
const configured = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT');
const sb = configured ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
const root = document.getElementById('adminRoot');
const modalBackdrop = document.getElementById('adminModalBackdrop');
const modal = document.getElementById('adminModal');
const authButton = document.getElementById('authButton');
let session = null;
let decks = [];
let categories = [];
let cards = [];
let selectedDeckId = null;

const esc = value => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

async function init(){
  if(!sb){ root.innerHTML='<div class="error">Set the Supabase URL and anon key in config.js first.</div>'; return; }
  const {data}=await sb.auth.getSession();
  session=data.session;
  sb.auth.onAuthStateChange((_e,s)=>{session=s; render();});
  authButton.onclick=()=>session?signOut():openLogin();
  await render();
}

async function render(){
  if(!session){
    authButton.textContent='Sign in';
    root.innerHTML='<div class="hero-card"><div class="eyebrow">Admin only</div><h2>Sign in to manage official content</h2><p class="lede">Normal study users never see this login. Your admin account is used only to protect the content manager.</p><div class="hero-actions"><button class="btn btn-primary" id="loginBtn">Sign in</button><a class="btn" href="index.html">Study without login</a></div></div>';
    document.getElementById('loginBtn')?.addEventListener('click',openLogin);
    return;
  }
  authButton.textContent='Sign out';
  const {data:adminRow,error:adminError}=await sb.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(adminError||!adminRow){
    root.innerHTML='<div class="error">This account is not in the admin_users table, so it cannot edit official content.</div>';
    return;
  }
  await loadAll();
  if(!selectedDeckId) selectedDeckId=decks[0]?.id||null;
  renderEditor();
}

async function loadAll(){
  const [d,c,cr]=await Promise.all([
    sb.from('official_decks').select('*').order('sort_order'),
    sb.from('official_categories').select('*').order('sort_order'),
    sb.from('official_cards').select('*').order('sort_order')
  ]);
  if(d.error||c.error||cr.error) throw (d.error||c.error||cr.error);
  decks=d.data||[]; categories=c.data||[]; cards=cr.data||[];
}

function renderEditor(){
  const deck=decks.find(d=>d.id===selectedDeckId);
  root.innerHTML=`<div class="admin-grid">
    <aside class="admin-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h3>Official decks</h3><div class="tiny">Create and organise the syllabus.</div></div><button class="btn btn-small btn-primary" id="newDeck">+</button></div>
      <div class="admin-list">${decks.map(d=>`<button class="${d.id===selectedDeckId?'active':''}" data-select-deck="${d.id}"><strong>${esc(d.icon)} ${esc(d.name)}</strong><span class="tiny">${cards.filter(c=>c.deck_id===d.id).length} cards</span></button>`).join('')||'<div class="empty">No decks yet.</div>'}</div>
    </aside>
    <section class="admin-panel">
      ${deck?deckEditor(deck):'<div class="empty">Create your first official deck.</div>'}
    </section>
  </div>`;
  document.getElementById('newDeck')?.addEventListener('click',openDeckModal);
  document.querySelectorAll('[data-select-deck]').forEach(b=>b.addEventListener('click',()=>{selectedDeckId=b.dataset.selectDeck;renderEditor();}));
  bindDeckActions(deck);
}

function deckEditor(deck){
  const deckCats=categories.filter(c=>c.deck_id===deck.id);
  const deckCards=cards.filter(c=>c.deck_id===deck.id);
  return `<div class="section-head" style="margin-top:0"><div><div class="eyebrow">Official deck</div><h2>${esc(deck.name)}</h2><p>${esc(deck.description)}</p></div><div class="toolbar"><button class="btn btn-small" id="editDeck">Edit deck</button><button class="btn btn-small btn-primary" id="newCard">+ Card</button></div></div>
    <div class="notice" style="margin-bottom:14px">Published: <strong>${deck.is_published?'yes':'no'}</strong>. Normal users can read published content, but only admin users can edit it.</div>
    <div class="section-head"><div><h3>Categories</h3><p>Group the official cards however you want.</p></div><button class="btn btn-small" id="newCategory">+ Category</button></div>
    <div class="list">${deckCats.map(cat=>`<div class="admin-row"><div><strong>${esc(cat.name)}</strong><p>${cards.filter(c=>c.category_id===cat.id).length} cards</p></div><button class="btn btn-small" data-edit-category="${cat.id}">Edit</button></div>`).join('')||'<div class="empty">No categories yet.</div>'}</div>
    <div class="section-head"><div><h3>Cards</h3><p>For Korean terms, use romanised Korean → English. No Hangul required.</p></div></div>
    <div class="list">${deckCards.map(card=>`<div class="admin-row"><div><strong>${esc(card.front)}</strong><p>${esc(card.back)}${card.category_id?' · '+esc(deckCats.find(c=>c.id===card.category_id)?.name||''):''}</p></div><div class="toolbar" style="margin:0"><button class="btn btn-small" data-edit-card="${card.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-card="${card.id}">Delete</button></div></div>`).join('')||'<div class="empty">No cards yet.</div>'}</div>`;
}

function bindDeckActions(deck){
  if(!deck)return;
  document.getElementById('editDeck')?.addEventListener('click',()=>openDeckModal(deck));
  document.getElementById('newCard')?.addEventListener('click',()=>openCardModal());
  document.getElementById('newCategory')?.addEventListener('click',()=>openCategoryModal());
  document.querySelectorAll('[data-edit-category]').forEach(b=>b.addEventListener('click',()=>openCategoryModal(categories.find(c=>c.id===b.dataset.editCategory))));
  document.querySelectorAll('[data-edit-card]').forEach(b=>b.addEventListener('click',()=>openCardModal(cards.find(c=>c.id===b.dataset.editCard))));
  document.querySelectorAll('[data-delete-card]').forEach(b=>b.addEventListener('click',()=>deleteCard(b.dataset.deleteCard)));
}

function openLogin(){
  modal.innerHTML=`<div class="modal-head"><div><h2>Admin sign in</h2><p>Use the Supabase Auth account you added to admin_users.</p></div><button class="icon-btn" data-close>✕</button></div><form class="form" id="loginForm"><div class="field"><label>Email</label><input type="email" id="email" required></div><div class="field"><label>Password</label><input type="password" id="password" required></div><div id="loginMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Sign in</button></div></form>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);
  document.getElementById('loginForm').onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});if(error)document.getElementById('loginMsg').innerHTML=`<div class="error">${esc(error.message)}</div>`;else closeModal();};
}

async function signOut(){await sb.auth.signOut();}

function openDeckModal(deck=null){
  modal.innerHTML=`<div class="modal-head"><div><h2>${deck?'Edit':'Create'} official deck</h2><p>Only admin users can change this content.</p></div><button class="icon-btn" data-close>✕</button></div><form class="form" id="deckForm"><div class="field"><label>Name</label><input id="deckName" required value="${esc(deck?.name||'')}" placeholder="Korean terminology"></div><div class="field"><label>Slug</label><input id="deckSlug" required value="${esc(deck?.slug||'')}" placeholder="korean-terminology"></div><div class="field"><label>Description</label><textarea id="deckDescription">${esc(deck?.description||'')}</textarea></div><div class="field"><label>Icon</label><input id="deckIcon" value="${esc(deck?.icon||'◈')}" maxlength="8"></div><div class="field"><label><input id="deckPublished" type="checkbox" ${deck?.is_published!==false?'checked':''}> Published</label></div><div id="deckMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
  modalBackdrop.classList.remove('hidden');
  modal.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);
  document.getElementById('deckForm').onsubmit=async e=>{e.preventDefault();const payload={name:document.getElementById('deckName').value.trim(),slug:document.getElementById('deckSlug').value.trim()||slugify(document.getElementById('deckName').value),description:document.getElementById('deckDescription').value.trim(),icon:document.getElementById('deckIcon').value.trim()||'◈',is_published:document.getElementById('deckPublished').checked};let result=deck?await sb.from('official_decks').update(payload).eq('id',deck.id):await sb.from('official_decks').insert(payload);if(result.error){document.getElementById('deckMsg').innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return;}closeModal();await render();};
}

function openCategoryModal(category=null){
  modal.innerHTML=`<div class="modal-head"><div><h2>${category?'Edit':'Create'} category</h2><p>Categories are specific to the selected official deck.</p></div><button class="icon-btn" data-close>✕</button></div><form class="form" id="categoryForm"><div class="field"><label>Name</label><input id="categoryName" required value="${esc(category?.name||'')}" placeholder="Commands"></div><div class="field"><label>Order</label><input id="categoryOrder" type="number" value="${category?.sort_order||0}"></div><div id="categoryMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
  modalBackdrop.classList.remove('hidden');modal.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);
  document.getElementById('categoryForm').onsubmit=async e=>{e.preventDefault();const payload={deck_id:selectedDeckId,name:document.getElementById('categoryName').value.trim(),sort_order:Number(document.getElementById('categoryOrder').value)||0};const result=category?await sb.from('official_categories').update(payload).eq('id',category.id):await sb.from('official_categories').insert(payload);if(result.error){document.getElementById('categoryMsg').innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return;}closeModal();await render();};
}

function openCardModal(card=null){
  const cats=categories.filter(c=>c.deck_id===selectedDeckId);
  modal.innerHTML=`<div class="modal-head"><div><h2>${card?'Edit':'Create'} official card</h2><p>Example Korean format: <strong>Charyot → Attention</strong>.</p></div><button class="icon-btn" data-close>✕</button></div><form class="form" id="cardForm"><div class="field"><label>Front / term</label><input id="cardFront" required value="${esc(card?.front||'')}"></div><div class="field"><label>Back / answer</label><input id="cardBack" required value="${esc(card?.back||'')}"></div><div class="field"><label>Category</label><select id="cardCategory"><option value="">No category</option>${cats.map(c=>`<option value="${c.id}" ${card?.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Notes</label><textarea id="cardNotes">${esc(card?.notes||'')}</textarea></div><div class="field"><label>Difficulty 1–5</label><input id="cardDifficulty" type="number" min="1" max="5" value="${card?.difficulty||1}"></div><div id="cardMsg"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`;
  modalBackdrop.classList.remove('hidden');modal.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);
  document.getElementById('cardForm').onsubmit=async e=>{e.preventDefault();const payload={deck_id:selectedDeckId,category_id:document.getElementById('cardCategory').value||null,front:document.getElementById('cardFront').value.trim(),back:document.getElementById('cardBack').value.trim(),notes:document.getElementById('cardNotes').value.trim(),difficulty:Math.max(1,Math.min(5,Number(document.getElementById('cardDifficulty').value)||1))};const result=card?await sb.from('official_cards').update(payload).eq('id',card.id):await sb.from('official_cards').insert(payload);if(result.error){document.getElementById('cardMsg').innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return;}closeModal();await render();};
}

async function deleteCard(id){if(!confirm('Delete this official card?'))return;const {error}=await sb.from('official_cards').delete().eq('id',id);if(error){alert(error.message);return;}await render();}
function closeModal(){modalBackdrop.classList.add('hidden');modal.innerHTML='';}
modalBackdrop.addEventListener('click',e=>{if(e.target===modalBackdrop)closeModal();});
const slugify=value=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
init().catch(e=>{console.error(e);root.innerHTML=`<div class="error">${esc(e.message)}</div>`;});

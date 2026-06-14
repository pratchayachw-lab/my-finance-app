// ═══════════════════════════════════════════
// CONFIG & STATE
// ═══════════════════════════════════════════
const SB_URL = "https://xyotqopwkcxblapoaiae.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5b3Rxb3B3a2N4YmxhcG9haWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MDI0ODMsImV4cCI6MjA5MTQ3ODQ4M30.qNBaRDz9WGAXxX0tUcBLoMg6yA4Jz4EypTT_TJuZzkk";

const VER = "v101_smart_budget";
const KEY = { A:`ws_accs_${VER}`, T:`ws_txs_${VER}`, C:`ws_cats_${VER}`, B:`ws_budgets_${VER}` };

let db = null;
let syncOn = localStorage.getItem('ws_sync') !== 'false';

const EMOJI = {
  'เงินเดือน':'💼','โบนัส':'🎁','รายได้เสริม':'💡','ดอกเบี้ย':'🏦',
  'อาหาร':'🍜','ช้อปปิ้ง':'🛍️','เดินทาง':'🚗','ท่องเที่ยว':'✈️',
  'สุขภาพ':'💊','บันเทิง':'🎬','บ้าน':'🏠','ค่าน้ำไฟ':'⚡',
  'การศึกษา':'📚','ออมทรัพย์':'🏦','ลงทุน':'📈','โอนเงิน':'↔️',
  'อื่นๆ':'📦','โทรศัพท์':'📱','อินเตอร์เน็ต':'🌐','ประกัน':'🛡️'
};
const getEmoji = name => EMOJI[name] || (name ? name[0].toUpperCase() : '•');

// Default Data
let categories = JSON.parse(localStorage.getItem(KEY.C)) || [
  {id:1, name:'เงินเดือน', type:'income', parent_id:null},
  {id:2, name:'อาหาร',    type:'expense', parent_id:null},
  {id:3, name:'ช้อปปิ้ง', type:'expense', parent_id:null},
  {id:4, name:'เดินทาง',  type:'expense', parent_id:null},
  {id:5, name:'สุขภาพ',   type:'expense', parent_id:null},
  {id:6, name:'บ้าน',     type:'expense', parent_id:null},
  {id:7, name:'อื่นๆ',    type:'expense', parent_id:null},
];
let accounts = JSON.parse(localStorage.getItem(KEY.A)) || [{id:1, name:'เงินสด', type:'asset', balance:0}];
let transactions = JSON.parse(localStorage.getItem(KEY.T)) || [];
let budgets = JSON.parse(localStorage.getItem(KEY.B)) || {};

let editTxId = null, editAccId = null;
let selectedMonth = new Date().getMonth();
let accountsChart = null;
let isManageOpen = false;
let numpadStr = '';
let selectedCat = '', selectedSubCat = '';
let currentTxType = 'expense';

const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
const getTodayDate = () => new Date().toISOString().split('T')[0];
const formatNum = (num, decimals = 0) => parseFloat(num || 0).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const formatShort = num => { 
  const v = Math.abs(parseFloat(num || 0)); 
  return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0); 
};
const escapeHtml = str => str.replace(/'/g, "\\'");

function showToast(msg, type = 'error') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast active ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('active'), 2600);
}

function setLoader(show, text = '') {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
  if (text) document.getElementById('loader-text').textContent = text;
}

// ═══════════════════════════════════════════
// SUPABASE (Sync)
// ═══════════════════════════════════════════
async function initDB() {
  if (typeof supabase === 'undefined') return;
  try { 
    db = supabase.createClient(SB_URL, SB_KEY); 
    if (syncOn) await pullFromCloud(); 
  } catch(e) { console.error(e); }
}

async function pullFromCloud() {
  if (!db || !syncOn) return;
  setLoader(true, 'กำลังซิงค์ข้อมูลกับคลาวด์...');
  try {
    const [ra, rt, rc, rb] = await Promise.all([
      db.from('accounts').select('*'),
      db.from('transactions').select('*').order('date', { ascending: false }),
      db.from('categories').select('*'),
      db.from('budgets').select('*')
    ]);
    if (ra.data?.length) accounts = ra.data;
    if (rt.data) transactions = rt.data;
    if (rc.data?.length) categories = rc.data;
    if (rb.data) rb.data.forEach(r => { budgets[parseInt(r.month_key)] = r.data; });
    saveDataLocally();
  } catch(e) {
    console.error(e);
    showToast('การดึงข้อมูลจาก Cloud ไม่สำเร็จ');
  }
  setLoader(false);
}

async function pushToCloud(table, data) {
  if (!db || !syncOn) return;
  try { await db.from(table).upsert(data); } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════
// STORAGE & INIT
// ═══════════════════════════════════════════
function saveDataLocally() {
  localStorage.setItem(KEY.A, JSON.stringify(accounts));
  localStorage.setItem(KEY.T, JSON.stringify(transactions));
  localStorage.setItem(KEY.C, JSON.stringify(categories));
  localStorage.setItem(KEY.B, JSON.stringify(budgets));
}

function ensureBudgetsExist() {
  for (let i = 0; i < 12; i++) {
    if (!budgets[i]) budgets[i] = {};
    categories.forEach(c => { if (budgets[i][c.name] === undefined) budgets[i][c.name] = 0; });
  }
}

function updateAllViews() {
  renderCalculations();
  renderSummaryInsight();
  renderRecentTransactions();
  saveDataLocally();
}

window.onload = async () => {
  setLoader(true, 'กำลังโหลดระบบ...');
  ensureBudgetsExist();
  document.getElementById('sync-icon').textContent = syncOn ? '☁️' : '💤';
  await initDB();
  updateAllViews();
  renderMonthTabs();
  setTransactionType('expense');
  setLoader(false);
};

// ═══════════════════════════════════════════
// UI & NAVIGATION
// ═══════════════════════════════════════════
const VIEWS = ['home', 'accounts', 'budget', 'history'];

function switchTab(targetView) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).classList.remove('active');
    document.getElementById(`nav-${v}`).classList.remove('active');
  });
  
  const el = document.getElementById(`view-${targetView}`);
  el.classList.add('active');
  document.getElementById(`nav-${targetView}`).classList.add('active');
  
  if (targetView === 'accounts') { renderAccountsList(); renderAccountsChart(); }
  if (targetView === 'budget') { renderMonthTabs(); renderBudgetProgress(); renderBudgetEditor(); renderCategoryManageList(); }
  if (targetView === 'history') { renderHistoryList(); }
  
  window.scrollTo(0, 0);
}

async function toggleSync() {
  syncOn = !syncOn;
  localStorage.setItem('ws_sync', String(syncOn));
  document.getElementById('sync-icon').textContent = syncOn ? '☁️' : '💤';
  if (syncOn) {
    await pullFromCloud();
    renderCalculations();
  } else {
    showToast('เข้าสู่โหมดใช้งานแบบออฟไลน์ (Local)', 'error');
  }
}

function toggleManageCategories() {
  isManageOpen = !isManageOpen;
  document.getElementById('manage-section').style.display = isManageOpen ? 'flex' : 'none';
  document.getElementById('btn-manage-toggle').textContent = isManageOpen ? '✕ ปิดหน้าจัดการ' : '⚙️ จัดการหมวดหมู่ & ตั้งงบประมาณ';
  if (isManageOpen) renderCategoryManageList();
}

// ═══════════════════════════════════════════
// CALCULATIONS & INSIGHTS
// ═══════════════════════════════════════════
function calculateMonth(month, year) {
  const txsInMonth = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const inc = txsInMonth.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
  const exp = txsInMonth.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
  return { inc, exp, net: inc - exp, txs: txsInMonth };
}

function calculatePlannedBudget() {
  const b = budgets[selectedMonth] || {};
  let plannedInc = 0, plannedExp = 0;
  
  categories.forEach(c => {
    const hasSubs = categories.some(s => s.parent_id === c.id);
    if ((!c.parent_id && !hasSubs) || c.parent_id) {
      const v = parseFloat(b[c.name] || 0);
      if (c.type === 'income') plannedInc += v; 
      else plannedExp += v;
    }
  });
  return plannedInc - plannedExp;
}

function renderCalculations() {
  const now = new Date();
  const netWorth = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);
  const { inc, exp, net } = calculateMonth(now.getMonth(), now.getFullYear());
  const plan = calculatePlannedBudget();
  
  const setEl = (id, val, cls) => { 
    const el = document.getElementById(id); 
    if (!el) return; 
    el.textContent = val; 
    el.className = `header-value ${cls || ''}`; 
  };
  
  setEl('header-networth', `฿${formatNum(netWorth, 2)}`, netWorth < 0 ? 'negative' : 'positive');
  
  const hNet = document.getElementById('header-monthly-net');
  if (hNet) {
    hNet.textContent = `฿${formatNum(net, 0)}`;
    hNet.className = net < 0 ? 'text-red' : 'text-green';
  }
  
  const setBasicEl = (id, val, isNeg) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = val;
      if(isNeg !== undefined) {
        el.className = isNeg ? 'text-red' : 'text-green';
      }
    }
  }
  
  setBasicEl('stat-inc', `฿${formatShort(inc)}`);
  setBasicEl('stat-exp', `฿${formatShort(exp)}`);
  setBasicEl('stat-plan', `฿${formatShort(plan)}`, plan < 0);
}

function renderSummaryInsight() {
  const el = document.getElementById('insight-card');
  if (!el) return;

  const now = new Date();
  const { inc, exp, net } = calculateMonth(now.getMonth(), now.getFullYear());
  const b = budgets[selectedMonth] || {};
  
  let plannedExp = 0;
  categories.forEach(c => {
    if (c.type === 'expense') {
      const hasSubs = categories.some(s => s.parent_id === c.id);
      if ((!c.parent_id && !hasSubs) || c.parent_id) {
         plannedExp += parseFloat(b[c.name] || 0);
      }
    }
  });

  let title = "สรุปสถานะการเงิน";
  let message = "";
  let icon = "💡";
  let colorClass = "text-blue";

  if (inc === 0 && exp === 0) {
    title = "เริ่มต้นเดือนใหม่!";
    message = "อย่าลืมบันทึกรายรับ-รายจ่ายของคุณเพื่อติดตามการเงินอย่างมีประสิทธิภาพ";
    icon = "🌟";
  } else if (net < 0) {
    title = "ระวัง! เดือนนี้ใช้จ่ายเกินรายรับ";
    message = `คุณมียอดติดลบ ฿${formatNum(Math.abs(net))} แนะนำให้ลดรายจ่ายในหมวดหมู่ที่ไม่จำเป็น`;
    icon = "⚠️";
    colorClass = "text-red";
  } else if (plannedExp > 0 && exp > plannedExp) {
    title = "คุณใช้จ่ายเกินงบที่ตั้งไว้";
    message = `มีการใช้จ่ายเกินงบประมาณที่วางไว้ ฿${formatNum(exp - plannedExp)} โปรดตรวจสอบแผนการใช้เงิน`;
    icon = "📉";
    colorClass = "text-amber";
  } else if (net > 0 && exp > 0) {
    const savingRate = ((net / inc) * 100).toFixed(0);
    title = "ยอดเยี่ยมมาก!";
    message = `เดือนนี้คุณมีเงินเก็บสุทธิ ฿${formatNum(net)} (คิดเป็น ${savingRate}% ของรายได้) รักษาวินัยแบบนี้ต่อไปนะ`;
    icon = "🚀";
    colorClass = "text-green";
  } else {
    title = "การเงินอยู่ในเกณฑ์ปกติ";
    message = "ควบคุมการใช้จ่ายได้ดี และอยู่ในงบประมาณที่ตั้งไว้";
    icon = "👍";
  }

  el.innerHTML = `
    <div class="insight-icon">${icon}</div>
    <div class="insight-content">
      <h4 class="${colorClass}">${title}</h4>
      <p>${message}</p>
    </div>
  `;
}

// ═══════════════════════════════════════════
// NUMPAD LOGIC
// ═══════════════════════════════════════════
function numpadClick(char) {
  if (char === '.' && numpadStr.includes('.')) return;
  if (char === '.' && !numpadStr) numpadStr = '0';
  if (numpadStr.includes('.') && numpadStr.split('.')[1]?.length >= 2) return;
  if (numpadStr.length >= 10) return;
  numpadStr += char;
  updateAmountDisplay();
}

function numpadDelete() {
  numpadStr = numpadStr.slice(0, -1);
  updateAmountDisplay();
}

function numpadClear() {
  numpadStr = '';
  updateAmountDisplay();
}

function getNumpadValue() {
  return parseFloat(numpadStr) || 0;
}

function updateAmountDisplay() {
  const el = document.getElementById('amount-display');
  el.textContent = numpadStr ? '฿' + numpadStr : '฿0';
  el.className = `numpad-amt ${currentTxType}`;
}

// ═══════════════════════════════════════════
// TRANSACTION SHEET LOGIC
// ═══════════════════════════════════════════
function setTransactionType(type) {
  currentTxType = type;
  ['expense', 'income', 'transfer'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.remove('active');
  });
  document.getElementById(`tab-${type}`).classList.add('active');
  
  document.getElementById('transfer-wrap').style.display = type === 'transfer' ? 'block' : 'none';
  document.getElementById('category-wrap').style.display = type === 'transfer' ? 'none' : 'block';
  
  updateAmountDisplay();
  if (type !== 'transfer') buildCategoryGrid(type);
}

function buildCategoryGrid(type) {
  const mainCats = categories.filter(c => c.type === type && !c.parent_id);
  selectedCat = ''; 
  selectedSubCat = '';
  
  document.getElementById('subcat-wrap').style.display = 'none';
  document.getElementById('grid-main-cat').innerHTML = mainCats.map(c => `
    <div class="cat-item" onclick="selectMainCategory('${escapeHtml(c.name)}', ${c.id})" id="cat-main-${c.id}">
      <span class="cat-emoji">${getEmoji(c.name)}</span>
      <span class="cat-name">${c.name}</span>
    </div>
  `).join('');
}

function selectMainCategory(name, id) {
  selectedCat = name;
  selectedSubCat = '';
  
  document.querySelectorAll('#grid-main-cat .cat-item').forEach(el => el.classList.remove('selected'));
  document.getElementById('cat-main-' + id)?.classList.add('selected');
  
  const subCats = categories.filter(c => c.parent_id === id);
  const subWrap = document.getElementById('subcat-wrap');
  
  if (subCats.length) {
    document.getElementById('grid-sub-cat').innerHTML = subCats.map(s => `
      <div class="cat-item" onclick="selectSubCategory('${escapeHtml(s.name)}', ${s.id})" id="cat-sub-${s.id}">
        <span class="cat-emoji">${getEmoji(s.name)}</span>
        <span class="cat-name">${s.name}</span>
      </div>
    `).join('');
    subWrap.style.display = 'block';
  } else {
    subWrap.style.display = 'none';
  }
}

function selectSubCategory(name, id) {
  selectedSubCat = name;
  document.querySelectorAll('#grid-sub-cat .cat-item').forEach(el => el.classList.remove('selected'));
  document.getElementById('cat-sub-' + id)?.classList.add('selected');
}

function openTransactionSheet(existingId = null) {
  editTxId = existingId;
  numpadClear();
  
  const accOptions = accounts.map(a => `<option value="${a.id}">${a.name} (฿${formatNum(a.balance)})</option>`).join('');
  document.getElementById('input-from-acc').innerHTML = accOptions;
  document.getElementById('input-to-acc').innerHTML = accOptions;
  document.getElementById('input-date').value = getTodayDate();
  document.getElementById('input-note').value = '';

  if (existingId) {
    const tx = transactions.find(t => t.id === existingId);
    if (!tx) return;
    
    numpadStr = String(tx.amount);
    document.getElementById('input-date').value = tx.date?.split('T')[0] || getTodayDate();
    document.getElementById('input-note').value = tx.note || '';
    
    const fromAcc = tx.from_id ? accounts.find(a => a.id === tx.from_id) : accounts.find(a => a.name === tx.from);
    if (fromAcc) document.getElementById('input-from-acc').value = fromAcc.id;
    
    if (tx.to_id || tx.to) {
      const toAcc = tx.to_id ? accounts.find(a => a.id === tx.to_id) : accounts.find(a => a.name === tx.to);
      if (toAcc) document.getElementById('input-to-acc').value = toAcc.id;
    }
    
    document.getElementById('btn-save-tx').textContent = 'อัปเดตรายการ';
    document.getElementById('btn-cancel-tx').style.display = 'block';
    document.getElementById('badge-editing').style.display = 'block';
    document.getElementById('fab-add').classList.add('editing');
    
    setTransactionType(tx.type);
    
    if (tx.type !== 'transfer') {
      const cat = categories.find(c => c.name === tx.category && !c.parent_id);
      if (cat) {
        setTimeout(() => {
          selectMainCategory(cat.name, cat.id);
          if (tx.sub_category) {
            const sc = categories.find(c => c.name === tx.sub_category);
            if (sc) selectSubCategory(sc.name, sc.id);
          }
        }, 50);
      }
    }
  } else {
    document.getElementById('btn-save-tx').textContent = 'บันทึกรายการ';
    document.getElementById('btn-cancel-tx').style.display = 'none';
    document.getElementById('badge-editing').style.display = 'none';
    document.getElementById('fab-add').classList.remove('editing');
    setTransactionType('expense');
  }
  
  updateAmountDisplay();
  document.getElementById('overlay-tx').classList.add('active');
  document.getElementById('sheet-tx').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeTransactionSheet() {
  editTxId = null;
  document.getElementById('overlay-tx').classList.remove('active');
  document.getElementById('sheet-tx').classList.remove('active');
  document.getElementById('fab-add').classList.remove('editing');
  document.body.style.overflow = '';
  numpadClear();
}

function revertTransactionBalance(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const fromAcc = accounts.find(a => a.name === tx.from);
  const toAcc = tx.to ? accounts.find(a => a.name === tx.to) : null;
  
  if (tx.type === 'expense') {
    if (fromAcc) fromAcc.balance += parseFloat(tx.amount);
  } else if (tx.type === 'income') {
    if (fromAcc) fromAcc.balance -= parseFloat(tx.amount);
  } else if (tx.type === 'transfer') {
    if (fromAcc) fromAcc.balance += parseFloat(tx.amount);
    if (toAcc) toAcc.balance -= parseFloat(tx.amount);
  }
}

async function handleSaveTransaction() {
  const amount = getNumpadValue();
  if (!amount || amount <= 0) return showToast('กรุณากรอกจำนวนเงินให้ถูกต้อง');
  if (currentTxType !== 'transfer' && !selectedCat) return showToast('กรุณาเลือกหมวดหมู่');
  
  const fromId = parseInt(document.getElementById('input-from-acc').value);
  const fromAcc = accounts.find(a => a.id === fromId);
  if (!fromAcc) return showToast('ไม่พบบัญชีต้นทาง');

  // Balance validation for expenses
  if (currentTxType !== 'income' && fromAcc.type !== 'debt') {
    const originalAmount = editTxId ? (transactions.find(t => t.id === editTxId)?.amount || 0) : 0;
    const effectiveBalance = fromAcc.balance + originalAmount;
    if (amount > effectiveBalance) return showToast('ยอดเงินในบัญชีไม่เพียงพอ');
  }
  
  if (editTxId) revertTransactionBalance(editTxId);

  const newTx = {
    id: editTxId || Date.now(),
    type: currentTxType,
    amount,
    from: fromAcc.name,
    from_id: fromAcc.id,
    category: currentTxType === 'transfer' ? 'โอนเงิน' : selectedCat,
    sub_category: selectedSubCat || null,
    note: document.getElementById('input-note').value.trim() || '',
    date: document.getElementById('input-date').value || getTodayDate()
  };

  if (currentTxType === 'transfer') {
    const toId = parseInt(document.getElementById('input-to-acc').value);
    const toAcc = accounts.find(a => a.id === toId);
    if (!toAcc) return showToast('ไม่พบบัญชีปลายทาง');
    if (toAcc.id === fromId) return showToast('บัญชีต้นทางและปลายทางต้องต่างกัน');
    
    fromAcc.balance -= amount;
    toAcc.balance += amount;
    newTx.to = toAcc.name;
    newTx.to_id = toAcc.id;
    
    await pushToCloud('accounts', fromAcc);
    await pushToCloud('accounts', toAcc);
  } else if (currentTxType === 'expense') {
    fromAcc.balance -= amount;
    await pushToCloud('accounts', fromAcc);
  } else {
    fromAcc.balance += amount;
    await pushToCloud('accounts', fromAcc);
  }

  if (editTxId) {
    const idx = transactions.findIndex(t => t.id === editTxId);
    if (idx !== -1) transactions[idx] = newTx;
  } else {
    transactions.unshift(newTx);
  }
  
  await pushToCloud('transactions', newTx);
  closeTransactionSheet();
  updateAllViews();
  showToast(editTxId ? 'อัปเดตรายการสำเร็จ ✓' : 'บันทึกรายการสำเร็จ ✓', 'success');
}

async function deleteTransaction(id) {
  if (!confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) return;
  const tx = transactions.find(t => t.id === id);
  revertTransactionBalance(id);
  transactions = transactions.filter(t => t.id !== id);
  
  if (db && syncOn) {
    await db.from('transactions').delete().eq('id', id);
    if (tx) {
      const fromAcc = accounts.find(a => a.name === tx.from);
      const toAcc = tx.to ? accounts.find(a => a.name === tx.to) : null;
      if (fromAcc) await pushToCloud('accounts', fromAcc);
      if (toAcc) await pushToCloud('accounts', toAcc);
    }
  }
  updateAllViews();
  if (document.getElementById('view-history').classList.contains('active')) {
    renderHistoryList();
  }
}

function triggerEditTransaction(id) {
  closeTransactionSheet();
  setTimeout(() => openTransactionSheet(id), 120);
}

// ═══════════════════════════════════════════
// HTML GENERATION
// ═══════════════════════════════════════════
function createTransactionHtml(tx) {
  const isIncome = tx.type === 'income';
  const isExpense = tx.type === 'expense';
  const icon = isIncome ? '💰' : (isExpense ? '💸' : '↔️');
  const subLabel = tx.sub_category ? ` <span class="text-muted">›</span> ${tx.sub_category}` : '';
  const noteLabel = tx.note ? `<span class="text-muted"> · ${tx.note}</span>` : '';
  const colorClass = isIncome ? 'income' : (isExpense ? 'expense' : 'transfer');
  
  return `
    <div class="tx-item" onclick="triggerEditTransaction(${tx.id})">
      <div class="tx-icon-wrap ${colorClass}">${icon}</div>
      <div class="tx-details">
        <div class="tx-title">${tx.category || '—'}${subLabel}</div>
        <div class="tx-subtitle">${tx.from || ''}${noteLabel}</div>
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val ${colorClass}">฿${formatNum(tx.amount)}</div>
        <button onclick="event.stopPropagation(); deleteTransaction(${tx.id})" style="font-size:9px;font-weight:700;color:var(--text-muted);padding-top:4px;">ลบ</button>
      </div>
    </div>
  `;
}

function renderRecentTransactions() {
  const el = document.getElementById('recent-list');
  if (!el) return;
  const recents = transactions.slice(0, 8);
  
  if (recents.length) {
    el.innerHTML = recents.map(createTransactionHtml).join('');
  } else {
    el.innerHTML = `<div style="text-align:center;padding:36px 0;color:var(--text-muted);font-size:13px;">กด + เพื่อบันทึกรายการแรก</div>`;
  }
}

function renderHistoryList() {
  const el = document.getElementById('history-list');
  if (!el) return;
  
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = transactions.filter(t => 
    (t.note || '').toLowerCase().includes(query) || 
    (t.category || '').toLowerCase().includes(query) || 
    (t.sub_category || '').toLowerCase().includes(query)
  );
  
  if (!filtered.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">ไม่พบรายการที่ค้นหา</div>`;
    return;
  }
  
  const byDate = {};
  filtered.forEach(t => {
    const d = t.date?.split('T')[0] || '';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });
  
  el.innerHTML = Object.entries(byDate).map(([dateStr, txs]) => {
    const displayDate = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' }) : '—';
    return `<div class="date-separator">${displayDate}</div>` + txs.map(createTransactionHtml).join('');
  }).join('');
}

// ═══════════════════════════════════════════
// ACCOUNTS MANAGEMENT
// ═══════════════════════════════════════════
function setAccountType(type) {
  document.getElementById('input-acc-type').value = type;
  document.getElementById('acc-tab-asset').className = 'type-tab' + (type === 'asset' ? ' income active' : '');
  document.getElementById('acc-tab-investment').className = 'type-tab' + (type === 'investment' ? ' transfer active' : '');
  document.getElementById('acc-tab-debt').className = 'type-tab' + (type === 'debt' ? ' expense active' : '');
}

function openAccountSheet(id = null) {
  editAccId = id;
  document.getElementById('sheet-acc-title').textContent = id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี';
  
  if (id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    document.getElementById('input-acc-name').value = acc.name;
    document.getElementById('input-acc-balance').value = acc.balance;
    setAccountType(acc.type);
  } else {
    document.getElementById('input-acc-name').value = '';
    document.getElementById('input-acc-balance').value = '';
    setAccountType('asset');
  }
  
  document.getElementById('overlay-acc').classList.add('active');
  document.getElementById('sheet-acc').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAccountSheet() {
  document.getElementById('overlay-acc').classList.remove('active');
  document.getElementById('sheet-acc').classList.remove('active');
  document.body.style.overflow = '';
  editAccId = null;
}

async function handleSaveAccount() {
  const name = document.getElementById('input-acc-name').value.trim();
  const type = document.getElementById('input-acc-type').value;
  const balance = parseFloat(document.getElementById('input-acc-balance').value) || 0;
  
  if (!name) return showToast('กรุณากรอกชื่อบัญชี');
  if (accounts.find(a => a.name === name && a.id !== editAccId)) return showToast('ชื่อบัญชีนี้มีอยู่แล้ว');
  
  let newAcc;
  if (editAccId) {
    const idx = accounts.findIndex(a => a.id === editAccId);
    accounts[idx] = { ...accounts[idx], name, type, balance };
    newAcc = accounts[idx];
  } else {
    newAcc = { id: Date.now(), name, type, balance };
    accounts.push(newAcc);
  }
  
  await pushToCloud('accounts', newAcc);
  closeAccountSheet();
  updateAllViews();
  if (document.getElementById('view-accounts').classList.contains('active')) {
    renderAccountsList();
    renderAccountsChart();
  }
  showToast('บันทึกบัญชีสำเร็จ ✓', 'success');
}

function renderAccountsList() {
  const el = document.getElementById('accounts-list');
  if (!el) return;
  
  if (!accounts.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">ยังไม่มีบัญชี แตะปุ่ม + เพื่อเพิ่ม</div>`;
    return;
  }
  
  el.innerHTML = accounts.map(a => {
    const bal = parseFloat(a.balance);
    const typeLabel = a.type === 'investment' ? 'การลงทุน' : (a.type === 'debt' ? 'หนี้สิน' : 'ทรัพย์สิน');
    return `
      <div class="account-card ${a.type}">
        <div class="flex-between">
          <div>
            <span class="pill ${a.type}">${typeLabel}</span>
            <div style="font-size:17px;font-weight:800;margin-top:8px;letter-spacing:-0.3px;">${a.name}</div>
            <div style="font-size:26px;font-weight:900;letter-spacing:-1px;margin-top:4px;color:${bal < 0 ? 'var(--accent-red)' : 'var(--text-main)'};">฿${formatNum(bal, 2)}</div>
          </div>
          <button onclick="openAccountSheet(${a.id})" class="btn-icon">✏️</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAccountsChart() {
  const canvas = document.getElementById('chart-accounts');
  if (!canvas) return;
  
  if (accountsChart) {
    accountsChart.destroy();
    accountsChart = null;
  }
  
  const validAccs = accounts.filter(a => parseFloat(a.balance) !== 0);
  if (!validAccs.length) return;
  
  accountsChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: validAccs.map(a => a.name),
      datasets: [{
        data: validAccs.map(a => Math.abs(parseFloat(a.balance))),
        backgroundColor: validAccs.map((_, i) => `hsl(${150 + i * 50}, 70%, ${50 + i * 5}%)`),
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 12, family: 'Inter' }, boxWidth: 12, padding: 16 }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════
// BUDGETS & CATEGORIES MANAGEMENT
// ═══════════════════════════════════════════
function selectMonth(index) {
  selectedMonth = index;
  renderMonthTabs();
  renderBudgetProgress();
  renderBudgetEditor();
  renderCalculations();
}

function renderMonthTabs() {
  const el = document.getElementById('month-tabs');
  if (!el) return;
  const currentMonthIdx = new Date().getMonth();
  
  el.innerHTML = MONTHS_SHORT.map((m, i) => `
    <button onclick="selectMonth(${i})" style="
      padding: 8px 16px; 
      border-radius: 20px; 
      font-size: 12px; 
      font-weight: 600; 
      white-space: nowrap;
      background: ${i === selectedMonth ? 'var(--accent-green)' : 'var(--bg-tertiary)'};
      color: ${i === selectedMonth ? '#000' : 'var(--text-muted)'};
      border: 1px solid ${i === selectedMonth ? 'var(--accent-green)' : 'var(--border-strong)'};
      ${i === currentMonthIdx ? 'text-decoration: underline; text-underline-offset: 4px;' : ''}
    ">${m}</button>
  `).join('');
}

function renderCategoryManageList() {
  const pSel = document.getElementById('manage-sub-parent');
  if (pSel) {
    const allMain = categories.filter(c => !c.parent_id);
    pSel.innerHTML = allMain.map(c => `<option value="${c.id}">${getEmoji(c.name)} ${c.name} (${c.type === 'income' ? 'รับ' : 'จ่าย'})</option>`).join('');
  }

  const generateList = type => {
    const mains = categories.filter(c => c.type === type && !c.parent_id);
    if (!mains.length) return `<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">ยังไม่มีหมวดหมู่</div>`;
    
    return mains.map(m => {
      const subs = categories.filter(c => c.parent_id === m.id);
      return `
        <div class="glass-card-sm mb-sm" style="padding:12px;">
          <div class="flex-between mb-sm">
            <span style="font-size:14px;font-weight:600;">${getEmoji(m.name)} ${m.name}</span>
            <button onclick="handleDeleteCategory(${m.id})" style="font-size:11px;font-weight:600;color:var(--accent-red);">ลบ</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${subs.map(s => `
              <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;background:var(--bg-secondary);border:1px solid var(--border-strong);font-size:11px;font-weight:500;">
                ${s.name}
                <button onclick="handleDeleteSubCategory(${s.id})" style="color:var(--text-muted);font-size:14px;line-height:1;margin-left:4px;">×</button>
              </div>
            `).join('')}
            ${!subs.length ? `<span style="font-size:11px;color:var(--text-muted);">ไม่มีหมวดย่อย</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  };
  
  const ee = document.getElementById('manage-list-expense');
  const ie = document.getElementById('manage-list-income');
  if (ee) ee.innerHTML = generateList('expense');
  if (ie) ie.innerHTML = generateList('income');
}

async function handleAddCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  const type = document.getElementById('new-cat-type').value;
  if (!name) return showToast('กรุณากรอกชื่อหมวดหมู่');
  if (categories.some(c => c.name === name && !c.parent_id && c.type === type)) return showToast('หมวดหมู่นี้มีอยู่แล้ว');
  
  const cat = { id: Date.now(), name, type, parent_id: null };
  categories.push(cat);
  await pushToCloud('categories', cat);
  
  document.getElementById('new-cat-name').value = '';
  updateAllViews();
  renderCategoryManageList();
}

async function handleAddSubCategory() {
  const name = document.getElementById('new-sub-name').value.trim();
  const pid = parseInt(document.getElementById('manage-sub-parent').value);
  if (!name) return showToast('กรุณากรอกชื่อหมวดหมู่ย่อย');
  
  const parent = categories.find(c => c.id === pid);
  if (!parent) return;
  if (categories.some(c => c.name === name && c.parent_id === pid)) return showToast('หมวดหมู่ย่อยนี้มีอยู่แล้ว');
  
  const cat = { id: Date.now(), name, type: parent.type, parent_id: pid };
  categories.push(cat);
  await pushToCloud('categories', cat);
  
  document.getElementById('new-sub-name').value = '';
  updateAllViews();
  renderCategoryManageList();
}

async function handleDeleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat || !confirm(`ลบหมวดหมู่ "${cat.name}" และหมวดหมู่ย่อยทั้งหมดหรือไม่?`)) return;
  
  const allIds = [id, ...categories.filter(c => c.parent_id === id).map(c => c.id)];
  categories = categories.filter(c => !allIds.includes(c.id));
  
  if (db && syncOn) await db.from('categories').delete().in('id', allIds);
  updateAllViews();
  renderCategoryManageList();
}

async function handleDeleteSubCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat || !confirm(`ลบหมวดหมู่ย่อย "${cat.name}" หรือไม่?`)) return;
  
  categories = categories.filter(c => c.id !== id);
  if (db && syncOn) await db.from('categories').delete().eq('id', id);
  updateAllViews();
  renderCategoryManageList();
}

function renderBudgetProgress() {
  const el = document.getElementById('budget-progress');
  if (!el) return;
  
  const b = budgets[selectedMonth] || {};
  const currentYear = new Date().getFullYear();
  
  const rows = categories.filter(c => !c.parent_id).map(m => {
    const subs = categories.filter(c => c.parent_id === m.id);
    const relatedCats = subs.length ? subs : [m];
    
    const budgetLimit = relatedCats.reduce((sum, c) => sum + (parseFloat(b[c.name]) || 0), 0);
    if (!budgetLimit) return '';
    
    const actualTxs = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === currentYear &&
             (t.category === m.name || relatedCats.some(c => c.name === t.sub_category || c.name === t.category));
    });
    
    const actualSpent = actualTxs.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const pct = Math.min(budgetLimit ? (actualSpent / budgetLimit) * 100 : 0, 100);
    const isOver = actualSpent > budgetLimit;
    
    let colorClass = 'var(--accent-green)';
    if (isOver) colorClass = 'var(--accent-red)';
    else if (pct > 75) colorClass = 'var(--accent-amber)';
    
    return `
      <div class="glass-card-sm" style="padding:16px; margin-bottom:10px;">
        <div class="flex-between">
          <span style="font-size:14px;font-weight:600;">${getEmoji(m.name)} ${m.name}</span>
          <div style="text-align:right;">
            <span style="font-size:14px;font-weight:800;color:${isOver ? 'var(--accent-red)' : 'var(--text-main)'};">฿${formatShort(actualSpent)}</span>
            <span style="font-size:11px;color:var(--text-muted);"> / ฿${formatShort(budgetLimit)}</span>
          </div>
        </div>
        <div class="progress-container">
          <div class="progress-fill" style="width:${pct}%;background:${colorClass};"></div>
        </div>
        ${isOver ? `<div style="font-size:11px;color:var(--accent-red);font-weight:600;margin-top:8px;">⚠️ เกินงบ ฿${formatShort(actualSpent - budgetLimit)}</div>` : ''}
      </div>
    `;
  }).filter(Boolean);
  
  el.innerHTML = rows.length ? rows.join('') : `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;">ยังไม่ได้ตั้งงบประมาณสำหรับเดือนนี้</div>`;
}

function renderBudgetEditor() {
  const b = budgets[selectedMonth] || {};
  
  const generateEditor = type => {
    const mains = categories.filter(c => c.type === type && !c.parent_id);
    if (!mains.length) return '';
    
    let html = `<div style="font-size:11px;font-weight:700;color:${type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'};letter-spacing:0.08em;margin-bottom:12px;">${type === 'income' ? '💰 ตั้งเป้ารายรับ' : '💸 ตั้งงบรายจ่าย'}</div>`;
    
    mains.forEach(m => {
      const subs = categories.filter(c => c.parent_id === m.id);
      if (subs.length) {
        html += `
          <div class="mb-md">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">${getEmoji(m.name)} ${m.name}</div>
            <div style="display:flex;flex-direction:column;gap:8px;padding-left:16px;border-left:2px solid var(--border-strong);">
              ${subs.map(s => `
                <div class="flex-between">
                  <span style="font-size:13px;font-weight:500;">${s.name}</span>
                  <div style="position:relative;">
                    <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--text-muted);">฿</span>
                    <input type="number" min="0" data-category="${s.name}" value="${b[s.name] || 0}" class="input-field budget-input" style="width:120px;padding-left:26px;text-align:right;">
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="flex-between mb-sm">
            <span style="font-size:13px;font-weight:500;">${getEmoji(m.name)} ${m.name}</span>
            <div style="position:relative;">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--text-muted);">฿</span>
              <input type="number" min="0" data-category="${m.name}" value="${b[m.name] || 0}" class="input-field budget-input" style="width:120px;padding-left:26px;text-align:right;">
            </div>
          </div>
        `;
      }
    });
    return html;
  };
  
  const incEl = document.getElementById('budget-editor-income');
  const expEl = document.getElementById('budget-editor-expense');
  if (incEl) incEl.innerHTML = generateEditor('income');
  if (expEl) expEl.innerHTML = generateEditor('expense');
}

function copyPreviousMonthBudget() {
  const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
  if (budgets[prevMonth] && Object.keys(budgets[prevMonth]).length) {
    budgets[selectedMonth] = { ...budgets[prevMonth] };
    renderBudgetEditor();
    renderCalculations();
    showToast(`คัดลอกงบประมาณจากเดือน ${MONTHS_FULL[prevMonth]} แล้ว ✓`, 'success');
  } else {
    showToast(`ยังไม่มีข้อมูลงบประมาณในเดือน ${MONTHS_FULL[prevMonth]}`, 'error');
  }
}

async function saveBudgets() {
  const data = {};
  document.querySelectorAll('.budget-input').forEach(input => {
    data[input.dataset.category] = parseFloat(input.value) || 0;
  });
  budgets[selectedMonth] = data;
  
  if (db && syncOn) {
    await db.from('budgets').upsert({ month_key: String(selectedMonth), data });
  }
  
  saveDataLocally();
  renderCalculations();
  renderSummaryInsight();
  renderBudgetProgress();
  showToast('บันทึกงบประมาณเรียบร้อยแล้ว ✓', 'success');
}

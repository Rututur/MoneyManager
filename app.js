'use strict';

const STORAGE_KEY = 'moneymanager:v1';
const COLORS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];

const PRESETS = {
  equilibre: [
    ['Épargne', 30],
    ['Loisirs', 30],
    ['Vie courante (courses, essence…)', 30],
    ['Imprévus', 10],
  ],
  epargne: [
    ['Épargne', 50],
    ['Loisirs', 15],
    ['Vie courante (courses, essence…)', 30],
    ['Imprévus', 5],
  ],
  plaisir: [
    ['Épargne', 15],
    ['Loisirs', 45],
    ['Vie courante (courses, essence…)', 30],
    ['Imprévus', 10],
  ],
};

const DEFAULT_INCOMES = ['Salaire net'];
const DEFAULT_EXPENSES = [
  'Loyer / crédit immobilier',
  'Électricité / gaz / eau',
  'Assurances',
  'Internet / téléphone',
  'Transport',
];

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const pct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

const $ = (sel) => document.querySelector(sel);

/* ---------- Utilitaires ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseNumber(value) {
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatInput(n) {
  return n ? String(n).replace('.', ',') : '';
}

function sum(items, key = 'amount') {
  return items.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function el(tag, { dataset, ariaLabel, ...props } = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (dataset) Object.assign(node.dataset, dataset);
  if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

/* ---------- État ---------- */

function presetAllocations(name) {
  return PRESETS[name].map(([label, percent]) => ({ id: uid(), label, percent }));
}

function emptyMonth() {
  return {
    incomes: DEFAULT_INCOMES.map((label) => ({ id: uid(), label, amount: 0 })),
    expenses: DEFAULT_EXPENSES.map((label) => ({ id: uid(), label, amount: 0 })),
  };
}

function freshState() {
  return { current: lastMonthKey(), months: {}, allocations: presetAllocations('equilibre'), updatedAt: 0 };
}

function isValidState(data) {
  return Boolean(data && data.months && typeof data.months === 'object' && Array.isArray(data.allocations));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isValidState(data)) return data;
    }
  } catch (e) {
    console.warn('Lecture des données impossible', e);
  }
  return freshState();
}

let state = loadState();

// Copie locale : affichage immédiat et fonctionnement hors connexion.
function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Sauvegarde impossible', e);
  }
}

function save() {
  state.updatedAt = Date.now();
  writeLocal();
  schedulePush();
}

function currentMonth() {
  if (!state.months[state.current]) state.months[state.current] = emptyMonth();
  return state.months[state.current];
}

function monthHasData(m) {
  return sum(m.incomes) > 0 || sum(m.expenses) > 0;
}

/* ---------- Rendu des listes ---------- */

function amountRow(item) {
  return el('div', { className: 'row', dataset: { id: item.id } }, [
    el('input', { type: 'text', className: 'f-label', value: item.label, placeholder: 'Libellé', ariaLabel: 'Libellé' }),
    el('div', { className: 'suffix-wrap' }, [
      el('input', {
        type: 'text',
        className: 'f-amount',
        inputMode: 'decimal',
        value: formatInput(item.amount),
        placeholder: '0',
        ariaLabel: 'Montant',
      }),
      el('span', { textContent: '€' }),
    ]),
    el('button', { type: 'button', className: 'icon-btn f-remove', textContent: '×', title: 'Supprimer', ariaLabel: 'Supprimer' }),
  ]);
}

function allocRow(item, index) {
  const swatch = el('span', { className: 'swatch' });
  swatch.style.background = `var(${COLORS[index % COLORS.length]})`;
  return el('div', { className: 'row alloc', dataset: { id: item.id } }, [
    swatch,
    el('input', { type: 'text', className: 'f-label', value: item.label, placeholder: 'Poste', ariaLabel: 'Poste' }),
    el('div', { className: 'suffix-wrap' }, [
      el('input', {
        type: 'text',
        className: 'f-percent',
        inputMode: 'decimal',
        value: formatInput(item.percent),
        placeholder: '0',
        ariaLabel: 'Pourcentage',
      }),
      el('span', { textContent: '%' }),
    ]),
    el('button', { type: 'button', className: 'icon-btn f-remove', textContent: '×', title: 'Supprimer', ariaLabel: 'Supprimer' }),
  ]);
}

function renderLists() {
  const m = currentMonth();
  $('#incomes-list').replaceChildren(...m.incomes.map(amountRow));
  $('#expenses-list').replaceChildren(...m.expenses.map(amountRow));
  $('#alloc-list').replaceChildren(...state.allocations.map(allocRow));
}

/* ---------- Calculs & résultats ---------- */

function compute() {
  const m = currentMonth();
  const income = sum(m.incomes);
  const expenses = sum(m.expenses);
  const rest = income - expenses;
  const base = Math.max(rest, 0);
  const totalPercent = sum(state.allocations, 'percent');
  const allocations = state.allocations.map((a, i) => ({
    ...a,
    color: COLORS[i % COLORS.length],
    value: (base * (Number(a.percent) || 0)) / 100,
  }));
  return { income, expenses, rest, base, totalPercent, allocations };
}

function showMessage(node, text, kind) {
  node.hidden = !text;
  node.textContent = text || '';
  node.className = `message ${kind || ''}`;
}

function renderResults() {
  const r = compute();

  $('#incomes-total').textContent = money.format(r.income);
  $('#expenses-total').textContent = money.format(r.expenses);
  $('#alloc-total').textContent = `${pct.format(r.totalPercent)} %`;

  $('#r-income').textContent = money.format(r.income);
  $('#r-expenses').textContent = money.format(r.expenses);
  $('#r-rest').textContent = money.format(r.rest);
  $('#r-rest').parentElement.classList.toggle('negative', r.rest < 0);

  // Contrôle des pourcentages
  const diff = Math.round((100 - r.totalPercent) * 100) / 100;
  if (diff > 0) {
    showMessage($('#alloc-message'), `Il reste ${pct.format(diff)} % non réparti (${money.format((r.base * diff) / 100)}).`, 'warning');
  } else if (diff < 0) {
    showMessage($('#alloc-message'), `Le total dépasse 100 % de ${pct.format(-diff)} %. Réduis certains postes.`, 'danger');
  } else {
    showMessage($('#alloc-message'), '');
  }

  // Message global
  if (r.income === 0) {
    showMessage($('#results-message'), 'Commence par indiquer tes revenus du mois.', 'warning');
  } else if (r.rest < 0) {
    showMessage(
      $('#results-message'),
      `Tes dépenses obligatoires dépassent tes revenus de ${money.format(-r.rest)}. Il n'y a rien à répartir ce mois-ci.`,
      'danger'
    );
  } else {
    showMessage($('#results-message'), '');
  }

  // Barre : part du revenu total
  const bar = $('#bar');
  const legend = $('#legend');
  bar.replaceChildren();
  legend.replaceChildren();
  if (r.income > 0) {
    const scale = r.totalPercent > 100 ? 100 / r.totalPercent : 1;
    const segments = [{ label: 'Dépenses obligatoires', value: Math.min(r.expenses, r.income), color: '--fixed' }].concat(
      r.allocations.map((a) => ({ label: a.label || 'Sans nom', value: a.value * scale, color: a.color }))
    );
    for (const s of segments) {
      if (s.value <= 0) continue;
      const share = (s.value / r.income) * 100;
      const seg = el('div', { className: 'bar-seg', title: `${s.label} : ${money.format(s.value)} (${pct.format(share)} %)` });
      seg.style.width = `${share}%`;
      seg.style.background = `var(${s.color})`;
      bar.append(seg);
    }
    for (const s of segments) {
      const dot = el('span', { className: 'swatch' });
      dot.style.background = `var(${s.color})`;
      legend.append(el('li', {}, [dot, s.label]));
    }
    if (r.totalPercent < 100 && r.base > 0) {
      const dot = el('span', { className: 'swatch' });
      dot.style.background = 'var(--unassigned)';
      legend.append(el('li', {}, [dot, 'Non réparti']));
    }
  }

  // Tableau des montants
  $('#alloc-table-body').replaceChildren(
    ...r.allocations.map((a) => {
      const dot = el('span', { className: 'swatch' });
      dot.style.background = `var(${a.color})`;
      return el('tr', {}, [
        el('td', { className: 'name' }, [dot, a.label || 'Sans nom']),
        el('td', { className: 'amount', textContent: money.format(a.value) }),
        el('td', { textContent: `${pct.format(Number(a.percent) || 0)} %` }),
        el('td', { textContent: r.income > 0 ? `${pct.format((a.value / r.income) * 100)} %` : '–' }),
      ]);
    })
  );

  // Indicateur : poids des dépenses obligatoires
  const indicator = $('#indicator');
  if (r.income > 0) {
    const ratio = (r.expenses / r.income) * 100;
    let kind = 'ok';
    let advice = 'Tes charges fixes sont maîtrisées.';
    if (ratio > 70) {
      kind = 'danger';
      advice = 'Tes charges fixes pèsent très lourd : regarde si certaines peuvent être renégociées.';
    } else if (ratio > 50) {
      kind = 'warning';
      advice = 'Tes charges fixes dépassent la moitié de tes revenus, ça laisse peu de marge.';
    }
    indicator.className = `indicator message ${kind}`;
    indicator.textContent = `Dépenses obligatoires : ${pct.format(ratio)} % de tes revenus. ${advice}`;
  } else {
    indicator.className = 'indicator';
    indicator.textContent = '';
  }

  renderHistory();
}

function renderHistory() {
  const keys = Object.keys(state.months)
    .filter((k) => monthHasData(state.months[k]))
    .sort()
    .reverse();
  $('#history-empty').hidden = keys.length > 0;
  $('#history-body').replaceChildren(
    ...keys.map((k) => {
      const m = state.months[k];
      const income = sum(m.incomes);
      const expenses = sum(m.expenses);
      const rest = income - expenses;
      const row = el('tr', { className: k === state.current ? 'current' : '', dataset: { month: k } }, [
        el('td', { textContent: monthLabel(k) }),
        el('td', { textContent: money.format(income) }),
        el('td', { textContent: money.format(expenses) }),
        el('td', { textContent: money.format(rest), className: rest < 0 ? 'neg' : '' }),
      ]);
      return row;
    })
  );
}

function renderAll() {
  $('#month').value = state.current;
  renderLists();
  renderResults();
}

/* ---------- Événements ---------- */

function listFor(container) {
  if (container.id === 'alloc-list') return state.allocations;
  return currentMonth()[container.dataset.kind];
}

function onListInput(e) {
  const row = e.target.closest('.row');
  if (!row) return;
  const list = listFor(e.currentTarget);
  const item = list.find((it) => it.id === row.dataset.id);
  if (!item) return;
  if (e.target.classList.contains('f-label')) item.label = e.target.value;
  if (e.target.classList.contains('f-amount')) item.amount = parseNumber(e.target.value);
  if (e.target.classList.contains('f-percent')) item.percent = parseNumber(e.target.value);
  save();
  renderResults();
}

function onListClick(e) {
  const btn = e.target.closest('.f-remove');
  if (!btn) return;
  const list = listFor(e.currentTarget);
  const idx = list.findIndex((it) => it.id === btn.closest('.row').dataset.id);
  if (idx >= 0) list.splice(idx, 1);
  save();
  renderAll();
}

for (const id of ['#incomes-list', '#expenses-list', '#alloc-list']) {
  $(id).addEventListener('input', onListInput);
  $(id).addEventListener('click', onListClick);
}

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.add;
    currentMonth()[kind].push({ id: uid(), label: '', amount: 0 });
    save();
    renderAll();
    $(`#${kind}-list .row:last-child .f-label`).focus();
  });
});

$('#add-alloc').addEventListener('click', () => {
  state.allocations.push({ id: uid(), label: '', percent: 0 });
  save();
  renderAll();
  $('#alloc-list .row:last-child .f-label').focus();
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.allocations = presetAllocations(btn.dataset.preset);
    save();
    renderAll();
  });
});

$('#month').addEventListener('change', (e) => {
  if (!e.target.value) return;
  state.current = e.target.value;
  save();
  renderAll();
});

$('#copy-previous').addEventListener('click', () => {
  const previous = Object.keys(state.months)
    .filter((k) => k < state.current && monthHasData(state.months[k]))
    .sort()
    .pop();
  if (!previous) {
    alert('Aucun mois précédent enregistré.');
    return;
  }
  if (monthHasData(currentMonth()) && !confirm(`Remplacer les données de ${monthLabel(state.current)} par celles de ${monthLabel(previous)} ?`)) {
    return;
  }
  const src = state.months[previous];
  const clone = (items) => items.map((it) => ({ ...it, id: uid() }));
  state.months[state.current] = { incomes: clone(src.incomes), expenses: clone(src.expenses) };
  save();
  renderAll();
});

$('#history-body').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-month]');
  if (!row) return;
  state.current = row.dataset.month;
  save();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `moneymanager-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isValidState(data)) throw new Error('format');
    if (!confirm('Remplacer toutes tes données actuelles par celles du fichier ?')) return;
    state = { current: data.current || lastMonthKey(), months: data.months, allocations: data.allocations };
    save();
    renderAll();
  } catch {
    alert("Ce fichier n'est pas une sauvegarde MoneyManager valide.");
  }
});

$('#reset').addEventListener('click', () => {
  if (!confirm('Effacer définitivement toutes les données ?')) return;
  state = freshState();
  save();
  renderAll();
});

/* ---------- Synchronisation en ligne (Firebase) ---------- */

const firebaseConfig = window.MONEYMANAGER_FIREBASE || {};
const cloudConfigured = Boolean(firebaseConfig.apiKey);
const cloudEnabled = cloudConfigured && Boolean(window.firebase);

let auth = null;
let budgetDoc = null; // document Firestore de l'utilisateur connecté
let stopListening = null;
let cloudReady = false; // true dès que la version du serveur a été reçue
let pushTimer = null;

function setSyncStatus(text, kind = '') {
  const node = $('#sync-status');
  node.textContent = text;
  node.className = `sync-status ${kind}`;
}

function schedulePush() {
  if (!budgetDoc) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 800);
  setSyncStatus('Enregistrement…', 'pending');
}

function push() {
  clearTimeout(pushTimer);
  pushTimer = null;
  // Tant que la version du serveur n'est pas connue, on attend : onRemote() décidera qui est le plus récent.
  if (!budgetDoc || !cloudReady) return Promise.resolve();
  if (!state.updatedAt) {
    // Données créées avant la synchronisation : on les date pour qu'elles ne soient pas rechargées inutilement.
    state.updatedAt = Date.now();
    writeLocal();
  }
  setSyncStatus('Enregistrement…', 'pending');
  return budgetDoc.set({ data: JSON.stringify(state), updatedAt: state.updatedAt }).catch((e) => {
    console.warn('Synchronisation impossible', e);
    setSyncStatus('Échec de la synchro', 'danger');
  });
}

function onRemote(snap) {
  if (snap.metadata.fromCache) {
    setSyncStatus('Hors ligne', 'pending');
    return;
  }
  cloudReady = true;
  // Modification locale en cours d'envoi : la version la plus récente est déjà la nôtre.
  if (snap.metadata.hasPendingWrites || pushTimer) return;

  const remote = snap.exists ? snap.data() : null;
  const remoteTime = (remote && remote.updatedAt) || 0;
  const localTime = state.updatedAt || 0;

  if (remote && remoteTime > localTime) {
    try {
      const data = JSON.parse(remote.data);
      if (isValidState(data)) {
        state = { ...data, current: state.current };
        writeLocal();
        renderAll();
      }
    } catch (e) {
      console.warn('Données en ligne illisibles', e);
    }
  } else if (!remote || remoteTime < localTime) {
    push();
    return;
  }
  setSyncStatus('Synchronisé', 'ok');
}

function showScreen(name) {
  $('#auth').hidden = name !== 'auth';
  for (const node of [$('.layout'), $('.month-picker'), $('.app-footer')]) node.hidden = name !== 'app';
  $('#account').hidden = !(cloudEnabled && name === 'app');
}

function authErrorMessage(e) {
  switch (e && e.code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.';
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cet e-mail : utilise « Se connecter ».';
    case 'auth/weak-password':
      return 'Mot de passe trop court (6 caractères minimum).';
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/network-request-failed':
      return 'Pas de connexion Internet.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'La création de compte est désactivée.';
    default:
      return `Erreur : ${(e && (e.code || e.message)) || 'inconnue'}`;
  }
}

async function runAuth(action) {
  const fields = $('#auth-fields');
  showMessage($('#auth-message'), '');
  fields.disabled = true;
  try {
    await action($('#auth-email').value.trim(), $('#auth-password').value);
  } catch (e) {
    showMessage($('#auth-message'), authErrorMessage(e), 'danger');
  } finally {
    fields.disabled = false;
  }
}

function startCloud() {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  auth.languageCode = 'fr';
  const db = firebase.firestore();

  auth.onAuthStateChanged((user) => {
    if (stopListening) stopListening();
    stopListening = null;
    budgetDoc = null;
    cloudReady = false;
    clearTimeout(pushTimer);
    pushTimer = null;

    if (user) {
      $('#account-email').textContent = user.email;
      setSyncStatus('Connexion…', 'pending');
      budgetDoc = db.collection('budgets').doc(user.uid);
      stopListening = budgetDoc.onSnapshot({ includeMetadataChanges: true }, onRemote, (e) => {
        console.warn('Lecture en ligne impossible', e);
        setSyncStatus('Échec de la synchro', 'danger');
      });
    }
    showScreen(user ? 'app' : 'auth');
  });

  $('#auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runAuth((email, password) => auth.signInWithEmailAndPassword(email, password));
  });

  $('#auth-signup').addEventListener('click', () => {
    if (!$('#auth-form').reportValidity()) return;
    runAuth((email, password) => auth.createUserWithEmailAndPassword(email, password));
  });

  $('#auth-reset').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim();
    if (!email) {
      showMessage($('#auth-message'), 'Indique ton adresse e-mail ci-dessus.', 'warning');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showMessage($('#auth-message'), 'Un e-mail pour changer ton mot de passe vient de t\'être envoyé.', 'ok');
    } catch (e) {
      showMessage($('#auth-message'), authErrorMessage(e), 'danger');
    }
  });

  $('#sign-out').addEventListener('click', async () => {
    // Envoie la dernière modification avant de partir (sans bloquer si hors ligne).
    if (pushTimer) await Promise.race([push(), new Promise((r) => setTimeout(r, 3000))]);
    await auth.signOut();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    state = freshState();
    renderAll();
  });
}

if (cloudEnabled) {
  $('#storage-note').textContent = 'Données synchronisées en ligne : retrouve-les sur tous tes appareils.';
  showScreen('loading');
  startCloud();
} else {
  if (cloudConfigured) {
    $('#storage-note').textContent = 'Service de synchronisation injoignable : données de ce navigateur uniquement.';
  }
  showScreen('app');
}

renderAll();

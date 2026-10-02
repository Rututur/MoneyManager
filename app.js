'use strict';

const STORAGE_KEY = 'moneymanager:v1';
const TAB_KEY = 'moneymanager:tab';
const COLORS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];
const FIXED = 'fixed'; // catégorie « Dépenses obligatoires »
const OTHER = 'other'; // catégorie « Autre »

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
  return n ? String(Math.round(n * 100) / 100).replace('.', ',') : '';
}

function sum(items, key = 'amount') {
  return items.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthLabel(key) {
  return capitalize(parseDateKey(key).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
}

function dayLabel(key) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key === dateKey(today)) return "Aujourd'hui";
  if (key === dateKey(yesterday)) return 'Hier';
  return capitalize(parseDateKey(key).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
}

function dateTimeLabel(ts) {
  const d = new Date(ts);
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} à ${time}`;
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

function swatch(color, className = 'swatch') {
  const node = el('span', { className });
  node.style.background = `var(${color})`;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

// Ne réécrit pas un champ pendant que l'utilisateur est en train de le remplir.
function setIfIdle(input, value) {
  if (document.activeElement !== input) input.value = value;
}

/* ---------- État ---------- */

function presetAllocations(name) {
  return PRESETS[name].map(([label, percent], i) => ({ id: uid(), label, percent, color: i }));
}

function emptyMonth() {
  return {
    incomes: DEFAULT_INCOMES.map((label) => ({ id: uid(), label, amount: 0 })),
    expenses: DEFAULT_EXPENSES.map((label) => ({ id: uid(), label, amount: 0 })),
  };
}

function freshState() {
  return {
    current: monthKey(new Date()),
    months: {},
    allocations: presetAllocations('equilibre'),
    account: { name: 'Compte courant', balance: 0, setAt: 0 },
    transactions: [],
    updatedAt: 0,
  };
}

function isValidState(data) {
  return Boolean(data && data.months && typeof data.months === 'object' && Array.isArray(data.allocations));
}

// Complète les données des anciennes versions (sans compte bancaire ni dépenses).
function normalizeState(data) {
  return {
    ...data,
    current: data.current || monthKey(new Date()),
    allocations: data.allocations.map((a, i) => ({ ...a, color: Number.isInteger(a.color) ? a.color : i })),
    account: { name: 'Compte courant', balance: 0, setAt: 0, ...(data.account || {}) },
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isValidState(data)) return normalizeState(data);
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
  return Boolean(m) && (sum(m.incomes) > 0 || sum(m.expenses) > 0);
}

function nextColor() {
  const used = new Set(state.allocations.map((a) => a.color));
  for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
  return state.allocations.length % COLORS.length;
}

function categories() {
  return [
    ...state.allocations.map((a) => ({ id: a.id, label: a.label || 'Sans nom', color: COLORS[a.color % COLORS.length] })),
    { id: FIXED, label: 'Dépenses obligatoires', color: '--fixed' },
    { id: OTHER, label: 'Autre', color: '--other' },
  ];
}

function categoryOf(tx, cats = categories()) {
  return cats.find((c) => c.id === tx.category) || cats[cats.length - 1];
}

function monthTransactions(key = state.current) {
  return state.transactions.filter((t) => t.date.slice(0, 7) === key);
}

function balanceInfo() {
  const a = state.account;
  const since = state.transactions.filter((t) => (t.createdAt || 0) > a.setAt);
  const spent = sum(since);
  return { set: a.setAt > 0, balance: a.balance, spent, count: since.length, estimated: a.balance - spent };
}

/* ---------- Rendu des listes du budget ---------- */

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

function allocRow(item) {
  return el('div', { className: 'row alloc', dataset: { id: item.id } }, [
    swatch(COLORS[item.color % COLORS.length]),
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

/* ---------- Calculs & résultats du budget ---------- */

function compute() {
  const m = currentMonth();
  const income = sum(m.incomes);
  const expenses = sum(m.expenses);
  const rest = income - expenses;
  const base = Math.max(rest, 0);
  const totalPercent = sum(state.allocations, 'percent');
  const allocations = state.allocations.map((a) => ({
    ...a,
    color: COLORS[a.color % COLORS.length],
    value: (base * (Number(a.percent) || 0)) / 100,
  }));
  return { income, expenses, rest, base, totalPercent, allocations };
}

function showMessage(node, text, kind) {
  node.hidden = !text;
  node.textContent = text || '';
  node.className = `message ${kind || ''}`;
}

function renderBudget(r) {
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
    for (const s of segments) legend.append(el('li', {}, [swatch(s.color), s.label]));
    if (r.totalPercent < 100 && r.base > 0) legend.append(el('li', {}, [swatch('--unassigned'), 'Non réparti']));
  }

  // Tableau des montants
  $('#alloc-table-body').replaceChildren(
    ...r.allocations.map((a) =>
      el('tr', {}, [
        el('td', { className: 'name' }, [swatch(a.color), a.label || 'Sans nom']),
        el('td', { className: 'amount', textContent: money.format(a.value) }),
        el('td', { textContent: `${pct.format(Number(a.percent) || 0)} %` }),
        el('td', { textContent: r.income > 0 ? `${pct.format((a.value / r.income) * 100)} %` : '–' }),
      ])
    )
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
}

/* ---------- Compte bancaire & dépenses ---------- */

function renderHero() {
  const b = balanceInfo();
  $('#hero-name').textContent = state.account.name || 'Mon compte';
  $('#hero-amount').textContent = b.set ? money.format(b.estimated) : '—';
  $('#hero-amount').classList.toggle('negative', b.set && b.estimated < 0);
  let sub = 'Indique ton solde actuel pour suivre ton argent.';
  if (b.set && b.count > 0) {
    sub = `${money.format(b.balance)} le ${dateTimeLabel(state.account.setAt)}, puis −${money.format(b.spent)} de dépenses`;
  } else if (b.set) {
    sub = `Solde mis à jour le ${dateTimeLabel(state.account.setAt)}`;
  }
  $('#hero-sub').textContent = sub;
}

function renderAccount() {
  const b = balanceInfo();
  setIfIdle($('#account-name'), state.account.name);
  setIfIdle($('#account-balance'), b.set ? b.estimated.toFixed(2).replace('.', ',') : '');
  const info = $('#account-info');
  if (!b.set) {
    info.textContent = "Aucun solde enregistré pour l'instant.";
  } else if (b.count === 0) {
    info.textContent = `Solde de ${money.format(b.balance)} enregistré le ${dateTimeLabel(state.account.setAt)}.`;
  } else {
    const n = b.count > 1 ? `${b.count} dépenses ajoutées` : '1 dépense ajoutée';
    info.textContent = `Solde de ${money.format(b.balance)} enregistré le ${dateTimeLabel(state.account.setAt)}. ${n} depuis : −${money.format(b.spent)}.`;
  }
}

let selectedCategory = null;

function renderCategoryChips() {
  const cats = categories();
  if (!cats.some((c) => c.id === selectedCategory)) selectedCategory = cats[0].id;
  $('#tx-categories').replaceChildren(
    ...cats.map((c) => {
      const chip = el('button', { type: 'button', className: 'cat-chip', dataset: { cat: c.id } }, [swatch(c.color), c.label]);
      chip.classList.toggle('selected', c.id === selectedCategory);
      chip.setAttribute('aria-pressed', String(c.id === selectedCategory));
      return chip;
    })
  );
}

function defaultTxDate() {
  const now = new Date();
  const thisMonth = monthKey(now);
  if (state.current === thisMonth) return dateKey(now);
  if (state.current > thisMonth) return `${state.current}-01`;
  const d = parseDateKey(state.current);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); // dernier jour du mois
}

function statTile(label, value, kind = '') {
  return el('div', { className: `stat ${kind}` }, [
    el('span', { className: 'stat-label', textContent: label }),
    el('span', { className: 'stat-value', textContent: money.format(value) }),
  ]);
}

function meterRow({ label, color, spent, budget }) {
  const row = el('div', { className: 'meter-row' });
  row.style.setProperty('--cat', `var(${color})`);
  const head = el('div', { className: 'meter-head' }, [
    el('span', { className: 'meter-name' }, [swatch(color), label]),
    el('span', { className: 'meter-values' }, [
      el('strong', { textContent: money.format(spent) }),
      budget == null ? null : ` / ${money.format(budget)}`,
    ]),
  ]);
  row.append(head);
  if (budget == null) {
    row.append(el('div', { className: 'meter-foot', textContent: 'Hors budget' }));
    return row;
  }
  const over = spent > budget + 0.004;
  const ratio = budget > 0 ? Math.min(spent / budget, 1) : spent > 0 ? 1 : 0;
  const fill = el('div', { className: 'meter-fill' });
  fill.style.width = `${ratio * 100}%`;
  const meter = el('div', {
    className: 'meter',
    title: `${label} : ${money.format(spent)} dépensés sur ${money.format(budget)} prévus`,
  }, fill);
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(Math.round(budget * 100) / 100));
  meter.setAttribute('aria-valuenow', String(Math.round(Math.min(spent, budget) * 100) / 100));
  meter.setAttribute('aria-label', label);
  row.append(meter);
  row.classList.toggle('over', over);
  const foot = over
    ? el('div', { className: 'meter-foot' }, [icon('alert'), `Dépassé de ${money.format(spent - budget)}`])
    : el('div', { className: 'meter-foot', textContent: `Reste ${money.format(budget - spent)}${budget > 0 ? ` · ${pct.format((spent / budget) * 100)} % utilisé` : ''}` });
  row.append(foot);
  return row;
}

function renderTracking(r) {
  $('#track-month').textContent = monthLabel(state.current);
  const cats = categories();
  const spentBy = {};
  for (const t of monthTransactions()) {
    const id = categoryOf(t, cats).id;
    spentBy[id] = (spentBy[id] || 0) + (Number(t.amount) || 0);
  }

  const rows = r.allocations.map((a) => ({ label: a.label || 'Sans nom', color: a.color, spent: spentBy[a.id] || 0, budget: a.value }));
  const budgetPostes = sum(rows, 'budget');
  const spentPostes = sum(rows, 'spent') + (spentBy[OTHER] || 0);
  rows.push({ label: 'Dépenses obligatoires', color: '--fixed', spent: spentBy[FIXED] || 0, budget: r.expenses });
  if (spentBy[OTHER]) rows.push({ label: 'Autre', color: '--other', spent: spentBy[OTHER], budget: null });

  const rest = budgetPostes - spentPostes;
  $('#track-stats').replaceChildren(
    statTile('Prévu dans les postes', budgetPostes),
    statTile('Dépensé (hors charges fixes)', spentPostes),
    statTile(rest < 0 ? 'Dépassement' : 'Reste à dépenser', rest, rest < 0 ? 'stat-main negative' : 'stat-main')
  );
  $('#meters').replaceChildren(...rows.map(meterRow));
}

function renderTransactions() {
  const cats = categories();
  const txs = monthTransactions().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const total = sum(txs);
  $('#tx-count').textContent = txs.length ? `${txs.length} · ${money.format(total)}` : '0';
  $('#tx-empty').hidden = txs.length > 0;

  const days = new Map();
  for (const t of txs) {
    if (!days.has(t.date)) days.set(t.date, []);
    days.get(t.date).push(t);
  }
  $('#tx-list').replaceChildren(
    ...[...days].map(([date, items]) =>
      el('li', { className: 'tx-day' }, [
        el('div', { className: 'tx-day-head' }, [
          el('span', { textContent: dayLabel(date) }),
          el('span', { textContent: `−${money.format(sum(items))}` }),
        ]),
        el(
          'ul',
          { className: 'tx-items' },
          items.map((t) => {
            const cat = categoryOf(t, cats);
            const item = el('li', { className: 'tx-item', dataset: { id: t.id } }, [
              el('span', { className: 'tx-badge' }, swatch(cat.color, 'tx-dot')),
              el('div', { className: 'tx-main' }, [
                el('span', { className: 'tx-label', textContent: t.label || cat.label }),
                el('span', { className: 'tx-cat', textContent: cat.label }),
              ]),
              el('span', { className: 'tx-amount', textContent: `−${money.format(t.amount)}` }),
              el('button', { type: 'button', className: 'icon-btn f-remove', textContent: '×', title: 'Supprimer', ariaLabel: 'Supprimer la dépense' }),
            ]);
            item.style.setProperty('--cat', `var(${cat.color})`);
            return item;
          })
        ),
      ])
    )
  );
}

/* ---------- Historique ---------- */

function renderHistory() {
  const keys = new Set(Object.keys(state.months).filter((k) => monthHasData(state.months[k])));
  for (const t of state.transactions) keys.add(t.date.slice(0, 7));
  const sorted = [...keys].sort().reverse();
  $('#history-empty').hidden = sorted.length > 0;
  $('#history-body').replaceChildren(
    ...sorted.map((k) => {
      const m = state.months[k] || { incomes: [], expenses: [] };
      const income = sum(m.incomes);
      const expenses = sum(m.expenses);
      const rest = income - expenses;
      const spent = sum(monthTransactions(k));
      return el('tr', { className: k === state.current ? 'current' : '', dataset: { month: k } }, [
        el('td', { textContent: monthLabel(k) }),
        el('td', { textContent: money.format(income) }),
        el('td', { textContent: money.format(expenses) }),
        el('td', { textContent: money.format(rest), className: rest < 0 ? 'neg' : '' }),
        el('td', { textContent: money.format(spent) }),
      ]);
    })
  );
}

/* ---------- Rendu global ---------- */

// Tout ce qui dépend des chiffres (appelé à chaque saisie).
function renderResults() {
  const r = compute();
  renderBudget(r);
  renderHero();
  renderAccount();
  renderCategoryChips();
  renderTracking(r);
  renderTransactions();
  renderHistory();
}

function renderAll() {
  $('#month').value = state.current;
  const txDate = $('#tx-date');
  if (txDate.value.slice(0, 7) !== state.current) txDate.value = defaultTxDate();
  renderLists();
  renderResults();
}

/* ---------- Onglets ---------- */

function setTab(name) {
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
  try {
    localStorage.setItem(TAB_KEY, name);
  } catch {}
}

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTab(btn.dataset.tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ---------- Notification ---------- */

let toastTimer = null;

function toast(text, action) {
  const node = $('#toast');
  const btn = $('#toast-action');
  $('#toast-text').textContent = text;
  btn.hidden = !action;
  btn.textContent = action ? action.label : '';
  btn.onclick = action
    ? () => {
        node.hidden = true;
        action.run();
      }
    : null;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), action ? 6000 : 2500);
}

/* ---------- Événements : budget ---------- */

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
  if (idx < 0) return;
  if (list === state.allocations) {
    const alloc = list[idx];
    const used = state.transactions.filter((t) => t.category === alloc.id).length;
    if (used && !confirm(`${used} dépense(s) sont classées dans « ${alloc.label || 'Sans nom'} ». Elles passeront dans « Autre ». Supprimer ce poste ?`)) {
      return;
    }
  }
  list.splice(idx, 1);
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
  state.allocations.push({ id: uid(), label: '', percent: 0, color: nextColor() });
  save();
  renderAll();
  $('#alloc-list .row:last-child .f-label').focus();
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    // On garde l'identifiant des postes du même nom pour ne pas perdre la catégorie des dépenses déjà saisies.
    state.allocations = presetAllocations(btn.dataset.preset).map((a) => {
      const old = state.allocations.find((o) => o.label.trim().toLowerCase() === a.label.toLowerCase());
      return old ? { ...a, id: old.id } : a;
    });
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
  toast(`Budget de ${monthLabel(previous)} repris`);
});

$('#history-body').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-month]');
  if (!row) return;
  state.current = row.dataset.month;
  save();
  renderAll();
  setTab('budget');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Événements : compte & dépenses ---------- */

$('#account-name').addEventListener('input', (e) => {
  state.account.name = e.target.value;
  save();
  renderHero();
});

$('#account-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#account-balance');
  if (!input.value.trim()) {
    input.focus();
    return;
  }
  state.account.balance = parseNumber(input.value);
  state.account.setAt = Date.now();
  input.blur();
  save();
  renderResults();
  toast('Solde mis à jour');
});

$('#hero-update').addEventListener('click', () => {
  setTab('compte');
  const input = $('#account-balance');
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input.focus({ preventScroll: true });
  input.select();
});

$('#tx-categories').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  selectedCategory = chip.dataset.cat;
  renderCategoryChips();
});

$('#tx-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const amountInput = $('#tx-amount');
  const amount = Math.round(parseNumber(amountInput.value) * 100) / 100;
  if (amount <= 0) {
    showMessage($('#tx-message'), 'Indique un montant supérieur à 0.', 'warning');
    amountInput.focus();
    return;
  }
  showMessage($('#tx-message'), '');
  const date = $('#tx-date').value || defaultTxDate();
  state.transactions.push({
    id: uid(),
    date,
    label: $('#tx-label').value.trim(),
    amount,
    category: selectedCategory,
    createdAt: Date.now(),
  });
  const month = date.slice(0, 7);
  const switched = month !== state.current;
  if (switched) state.current = month;
  save();
  amountInput.value = '';
  $('#tx-label').value = '';
  if (switched) renderAll();
  else renderResults();
  toast(switched ? `Dépense ajoutée en ${monthLabel(month)}` : `Dépense de ${money.format(amount)} ajoutée`);
});

$('#tx-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.f-remove');
  if (!btn) return;
  const idx = state.transactions.findIndex((t) => t.id === btn.closest('.tx-item').dataset.id);
  if (idx < 0) return;
  const [removed] = state.transactions.splice(idx, 1);
  save();
  renderResults();
  toast('Dépense supprimée', {
    label: 'Annuler',
    run: () => {
      state.transactions.splice(Math.min(idx, state.transactions.length), 0, removed);
      save();
      renderResults();
    },
  });
});

/* ---------- Événements : sauvegarde ---------- */

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
    state = normalizeState(data);
    save();
    renderAll();
    toast('Sauvegarde importée');
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
        state = normalizeState({ ...data, current: state.current });
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
  for (const node of [$('.layout'), $('#hero-row'), $('#tabs'), $('.app-footer')]) node.hidden = name !== 'app';
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

let initialTab = 'compte';
try {
  initialTab = localStorage.getItem(TAB_KEY) || 'compte';
} catch {}
setTab(document.querySelector(`[data-panel="${initialTab}"]`) ? initialTab : 'compte');

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

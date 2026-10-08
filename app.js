(() => {
  'use strict';

  const PROJECT_ID = 'carina-sluchatka';
  const DATABASE_ID = '(default)';
  const COLLECTION = 'porady';
  const EDIT_PIN = '123258';
  const DATE_PIN = '1456';

  const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

  const dateLabel = document.getElementById('dateLabel');
  const showSelect = document.getElementById('showSelect');
  const showMeta = document.getElementById('showMeta');
  const headphonesInput = document.getElementById('headphonesInput');
  const saveBtn = document.getElementById('saveBtn');
  const editBtn = document.getElementById('editBtn');
  const status = document.getElementById('status');
  const refreshBtn = document.getElementById('refreshBtn');
  const changeDateBtn = document.getElementById('changeDateBtn');
  const statsBtn = document.getElementById('statsBtn');

  const datePickerPanel = document.getElementById('datePickerPanel');
  const datePickerCloseBtn = document.getElementById('datePickerCloseBtn');
  const datePickerInput = document.getElementById('datePickerInput');
  const datePickerApplyBtn = document.getElementById('datePickerApplyBtn');

  const statsPanel = document.getElementById('statsPanel');
  const statsCloseBtn = document.getElementById('statsCloseBtn');
  const statsFrom = document.getElementById('statsFrom');
  const statsTo = document.getElementById('statsTo');
  const statsFilter = document.getElementById('statsFilter');
  const statsTypeFilter = document.getElementById('statsTypeFilter');
  const statsLoadBtn = document.getElementById('statsLoadBtn');
  const statsExportBtn = document.getElementById('statsExportBtn');
  const statsStatus = document.getElementById('statsStatus');
  const statsResults = document.getElementById('statsResults');

  let todayShows = [];
  let selectedDateISO = localISODate();
  let editingUnlocked = false;
  let statsData = [];

  function localISODate(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function addDaysISO(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return localISODate(date);
  }

  function dateFromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatISODateCs(iso) {
    return formatDateCs(dateFromISO(iso));
  }

  function firstDayOfMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function lastDayOfMonth(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return localISODate(d);
  }

  function formatDateCs(date = new Date()) {
    return date.toLocaleDateString('cs-CZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function isoToCs(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function minutesOfTime(time) {
    const [h, m] = String(time || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function fieldString(fields, key) {
    return fields?.[key]?.stringValue ?? '';
  }

  function fieldBool(fields, key) {
    return fields?.[key]?.booleanValue ?? false;
  }

  function fieldInteger(fields, key) {
    const raw = fields?.[key]?.integerValue;
    return raw == null ? null : Number(raw);
  }

  function documentId(name) {
    return decodeURIComponent(String(name).split('/').pop());
  }

  function setStatus(text, type = 'info') {
    status.textContent = text;
    status.className = `status ${type}`;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatNumber(value, digits = 1) {
    if (value == null || Number.isNaN(value)) return '—';
    return Number(value).toLocaleString('cs-CZ', {
      maximumFractionDigits: digits
    });
  }

  async function fetchShowsByDate(dateISO) {

    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
      `/databases/${encodeURIComponent(DATABASE_ID)}/documents:runQuery`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'datumISO' },
              op: 'EQUAL',
              value: { stringValue: dateISO }
            }
          }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Firestore HTTP ${response.status}: ${body}`);
    }

    const rows = await response.json();

    return rows
      .filter(row => row.document)
      .map(row => {
        const doc = row.document;
        const f = doc.fields || {};

        return {
          id: documentId(doc.name),
          datumISO: fieldString(f, 'datumISO'),
          cas: fieldString(f, 'cas'),
          nazev: fieldString(f, 'nazev'),
          typ: fieldString(f, 'typ'),
          aktivni: fieldBool(f, 'aktivni'),
          sluchatka: fieldInteger(f, 'sluchatka')
        };
      })
      .filter(item => item.aktivni)
      .sort((a, b) => minutesOfTime(a.cas) - minutesOfTime(b.cas));
  }

  function findDefaultShowIndex(shows) {
    if (!shows.length) return -1;

    const now = nowMinutes();
    let bestIndex = 0;
    let bestDistance = Infinity;

    shows.forEach((show, index) => {
      const distance = Math.abs(minutesOfTime(show.cas) - now);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function renderShows(preferredId = null) {
    showSelect.innerHTML = '';

    if (!todayShows.length) {
      const option = document.createElement('option');
      option.textContent = 'Dnes nejsou žádné pořady';
      option.value = '';
      showSelect.appendChild(option);

      showSelect.disabled = true;
      headphonesInput.disabled = true;
      saveBtn.disabled = true;
      saveBtn.hidden = false;
      editBtn.hidden = true;
      showMeta.textContent = '';
      return;
    }

    showSelect.disabled = false;

    for (const show of todayShows) {
      const option = document.createElement('option');
      option.value = show.id;
      option.textContent = `${show.cas} – ${show.nazev}`;
      showSelect.appendChild(option);
    }

    if (preferredId && todayShows.some(s => s.id === preferredId)) {
      showSelect.value = preferredId;
    } else {
      const index = findDefaultShowIndex(todayShows);
      showSelect.selectedIndex = index >= 0 ? index : 0;
    }

    updateSelectedShow();
  }

  function selectedShow() {
    return todayShows.find(show => show.id === showSelect.value) || null;
  }

  function setLockedState(show) {
    const hasSavedValue = Number.isInteger(show?.sluchatka);
    const locked = hasSavedValue && !editingUnlocked;

    headphonesInput.disabled = locked;
    headphonesInput.readOnly = locked;
    headphonesInput.classList.toggle('locked', locked);

    saveBtn.hidden = locked;
    saveBtn.disabled = locked;

    editBtn.hidden = !locked;
    editBtn.disabled = !locked;

    if (locked) {
      setStatus(`✓ Uloženo: ${show.sluchatka}`, 'ok');
    }
  }

  function updateSelectedShow() {
    editingUnlocked = false;

    const show = selectedShow();

    if (!show) {
      showMeta.textContent = '';
      headphonesInput.value = '';
      return;
    }

    showMeta.textContent =
      show.typ === 'modry' ? 'Školní' :
      show.typ === 'hnedy' ? 'Veřejnost' : '';

    headphonesInput.value =
      Number.isInteger(show.sluchatka) ? String(show.sluchatka) : '';

    setLockedState(show);

    if (!Number.isInteger(show.sluchatka)) {
      setStatus('', 'info');

      setTimeout(() => {
        headphonesInput.focus();
        headphonesInput.select();
      }, 80);
    }
  }

  function unlockEditing() {
    const show = selectedShow();
    if (!show || !Number.isInteger(show.sluchatka)) return;

    const pin = prompt('Zadej PIN pro editaci:');
    if (pin === null) return;

    if (pin !== EDIT_PIN) {
      setStatus('Nesprávný PIN.', 'error');
      return;
    }

    editingUnlocked = true;

    headphonesInput.disabled = false;
    headphonesInput.readOnly = false;
    headphonesInput.classList.remove('locked');

    saveBtn.hidden = false;
    saveBtn.disabled = false;
    editBtn.hidden = true;

    setStatus('Editace odemčena.', 'info');

    setTimeout(() => {
      headphonesInput.focus();
      headphonesInput.select();
    }, 80);
  }

  async function saveHeadphones() {
    const show = selectedShow();

    if (!show) {
      setStatus('Není vybraný pořad.', 'error');
      return;
    }

    const isExistingValue = Number.isInteger(show.sluchatka);

    if (isExistingValue && !editingUnlocked) {
      setStatus('Pro změnu použij tlačítko Editovat.', 'error');
      return;
    }

    const raw = headphonesInput.value.trim();

    if (!/^\d{1,3}$/.test(raw)) {
      setStatus('Zadej celé číslo 0–999.', 'error');
      headphonesInput.focus();
      return;
    }

    const count = Number(raw);

    saveBtn.disabled = true;
    setStatus('Ukládám…', 'info');

    try {
      const url =
        `${FIRESTORE_BASE}/${COLLECTION}/${encodeURIComponent(show.id)}` +
        `?updateMask.fieldPaths=sluchatka` +
        `&updateMask.fieldPaths=sluchatkaAktualizovano`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            sluchatka: { integerValue: String(count) },
            sluchatkaAktualizovano: { timestampValue: new Date().toISOString() }
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Firestore HTTP ${response.status}: ${body}`);
      }

      const saved = await response.json();
      const savedCount = Number(saved.fields?.sluchatka?.integerValue);

      if (savedCount !== count) {
        throw new Error('Kontrola po zápisu neodpovídá zadanému počtu.');
      }

      show.sluchatka = count;
      editingUnlocked = false;

      headphonesInput.value = String(count);
      setLockedState(show);
      setStatus(`✓ Uloženo: ${count}`, 'ok');

    } catch (error) {
      console.error(error);
      setStatus('Uložení se nepodařilo.', 'error');
      alert('Uložení se nepodařilo:\n\n' + error.message);

      if (editingUnlocked) {
        saveBtn.hidden = false;
        saveBtn.disabled = false;
        editBtn.hidden = true;
      }
    }
  }

  async function load() {
    dateLabel.textContent = formatISODateCs(selectedDateISO);
    setStatus(
      selectedDateISO === localISODate()
        ? 'Načítám dnešní pořady…'
        : 'Načítám pořady pro vybraný den…',
      'info'
    );

    try {
      const currentId = showSelect.value || null;
      todayShows = await fetchShowsByDate(selectedDateISO);
      renderShows(currentId);

      if (todayShows.length) {
        const show = selectedShow();

        if (!Number.isInteger(show?.sluchatka)) {
          setStatus(`Načteno pořadů: ${todayShows.length}`, 'info');
        }
      } else {
        setStatus('Pro vybraný den nejsou ve Firestore žádné aktivní pořady.', 'error');
      }
    } catch (error) {
      console.error(error);
      setStatus('Pořady se nepodařilo načíst.', 'error');
      alert('Pořady se nepodařilo načíst:\n\n' + error.message);
    }
  }

  function openDatePicker() {
    const pin = prompt('Zadej PIN pro výběr jiného data:');

    if (pin === null) return;

    if (pin !== DATE_PIN) {
      setStatus('Nesprávný PIN pro výběr data.', 'error');
      return;
    }

    const today = localISODate();
    const minDate = addDaysISO(today, -6);

    datePickerInput.min = minDate;
    datePickerInput.max = today;
    datePickerInput.value = selectedDateISO;

    datePickerPanel.hidden = false;
  }

  function closeDatePicker() {
    datePickerPanel.hidden = true;
  }

  async function applySelectedDate() {
    const value = datePickerInput.value;
    const today = localISODate();
    const minDate = addDaysISO(today, -6);

    if (!value || value < minDate || value > today) {
      alert('Lze vybrat pouze dnešek nebo některý z předchozích 6 dní.');
      return;
    }

    selectedDateISO = value;
    closeDatePicker();
    await load();
  }

  // =========================================================
  // STATISTIKY
  // =========================================================

  async function fetchAllShows() {
    const all = [];
    let pageToken = '';

    do {
      const url = new URL(`${FIRESTORE_BASE}/${COLLECTION}`);
      url.searchParams.set('pageSize', '1000');

      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), { method: 'GET' });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Firestore HTTP ${response.status}: ${body}`);
      }

      const data = await response.json();

      for (const doc of data.documents || []) {
        const f = doc.fields || {};

        all.push({
          id: documentId(doc.name),
          datumISO: fieldString(f, 'datumISO'),
          cas: fieldString(f, 'cas'),
          nazev: fieldString(f, 'nazev'),
          typ: fieldString(f, 'typ'),
          aktivni: fieldBool(f, 'aktivni'),
          sluchatka: fieldInteger(f, 'sluchatka')
        });
      }

      pageToken = data.nextPageToken || '';

    } while (pageToken);

    return all;
  }

  function statsFiltered() {
    const from = statsFrom.value;
    const to = statsTo.value;
    const filter = statsFilter.value;
    const typeFilter = statsTypeFilter.value;

    return statsData
      .filter(item => item.datumISO >= from && item.datumISO <= to)
      .filter(item => {
        if (typeFilter === 'all') return true;
        return item.typ === typeFilter;
      })
      .filter(item => {
        if (filter === 'entered') return Number.isInteger(item.sluchatka);
        if (filter === 'missing') return !Number.isInteger(item.sluchatka);
        return true;
      })
      .sort((a, b) =>
        a.datumISO.localeCompare(b.datumISO) ||
        minutesOfTime(a.cas) - minutesOfTime(b.cas) ||
        a.nazev.localeCompare(b.nazev, 'cs')
      );
  }

  function statsSummary(items) {
    const entered = items.filter(item => Number.isInteger(item.sluchatka));
    const totalHeadphones = entered.reduce((sum, item) => sum + item.sluchatka, 0);

    return {
      total: items.length,
      entered: entered.length,
      missing: items.length - entered.length,
      totalHeadphones,
      average: entered.length ? totalHeadphones / entered.length : null,
      max: entered.length ? Math.max(...entered.map(i => i.sluchatka)) : null
    };
  }

  function weekdayNameFromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();

    return [
      'Neděle',
      'Pondělí',
      'Úterý',
      'Středa',
      'Čtvrtek',
      'Pátek',
      'Sobota'
    ][day];
  }

  function aggregateRanking(items, keyFn) {
    const map = new Map();

    for (const item of items) {
      if (!Number.isInteger(item.sluchatka)) continue;

      const key = keyFn(item);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, {
          label: key,
          totalHeadphones: 0,
          enteredShows: 0,
          max: 0
        });
      }

      const row = map.get(key);
      row.totalHeadphones += item.sluchatka;
      row.enteredShows += 1;
      row.max = Math.max(row.max, item.sluchatka);
    }

    return [...map.values()]
      .map(row => ({
        ...row,
        average: row.enteredShows
          ? row.totalHeadphones / row.enteredShows
          : null
      }))
      .sort((a, b) =>
        b.totalHeadphones - a.totalHeadphones ||
        b.average - a.average ||
        a.label.localeCompare(b.label, 'cs')
      );
  }

  function renderRankingTable(title, rows, firstColumnTitle) {
    return `
      <h3 class="stats-subtitle">${escapeHtml(title)}</h3>

      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Pořadí</th>
              <th>${escapeHtml(firstColumnTitle)}</th>
              <th>Celkem sluchátek</th>
              <th>Uvedení se záznamem</th>
              <th>Průměr</th>
              <th>Maximum</th>
            </tr>
          </thead>

          <tbody>
            ${rows.map((row, index) => `
              <tr>
                <td><strong>${index + 1}.</strong></td>
                <td><strong>${escapeHtml(row.label)}</strong></td>
                <td>${formatNumber(row.totalHeadphones, 0)}</td>
                <td>${row.enteredShows}</td>
                <td>${formatNumber(row.average, 1)}</td>
                <td>${formatNumber(row.max, 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStats() {
    const items = statsFiltered();
    const s = statsSummary(items);

    const byTitle = new Map();

    for (const item of items) {
      const title = item.nazev.trim().replace(/\s+/g, ' ');

      if (!byTitle.has(title)) {
        byTitle.set(title, []);
      }

      byTitle.get(title).push(item);
    }

    const titleRows = [...byTitle]
      .map(([title, rows]) => ({
        title,
        ...statsSummary(rows)
      }))
      .sort((a, b) =>
        b.totalHeadphones - a.totalHeadphones ||
        a.title.localeCompare(b.title, 'cs')
      );

    const weekdayRows = aggregateRanking(
      items,
      item => weekdayNameFromISO(item.datumISO)
    );

    const startTimeRows = aggregateRanking(
      items,
      item => item.cas
    );

    const showNameRows = aggregateRanking(
      items,
      item => item.nazev.trim().replace(/\s+/g, ' ')
    );

    const topWeekday = weekdayRows[0] || null;
    const topStartTime = startTimeRows[0] || null;
    const topShowName = showNameRows[0] || null;

    statsResults.innerHTML = `
      <div class="stats-cards">
        <div class="stats-card">Pořadů celkem<strong>${s.total}</strong></div>
        <div class="stats-card">Se zadaným počtem<strong>${s.entered}</strong></div>
        <div class="stats-card">Bez záznamu<strong>${s.missing}</strong></div>
        <div class="stats-card">Celkem půjčeno<strong>${formatNumber(s.totalHeadphones, 0)}</strong></div>
        <div class="stats-card">Průměr na zadaný pořad<strong>${formatNumber(s.average, 1)}</strong></div>
        <div class="stats-card">Maximum<strong>${formatNumber(s.max, 0)}</strong></div>
      </div>

      <div class="stats-cards">
        <div class="stats-card">
          TOP DEN
          <strong>${topWeekday ? escapeHtml(topWeekday.label) : '—'}</strong>
          ${topWeekday ? `${formatNumber(topWeekday.totalHeadphones, 0)} sluchátek` : ''}
        </div>

        <div class="stats-card">
          TOP ZAČÁTEK
          <strong>${topStartTime ? escapeHtml(topStartTime.label) : '—'}</strong>
          ${topStartTime ? `${formatNumber(topStartTime.totalHeadphones, 0)} sluchátek` : ''}
        </div>

        <div class="stats-card">
          TOP POŘAD
          <strong>${topShowName ? escapeHtml(topShowName.label) : '—'}</strong>
          ${topShowName ? `${formatNumber(topShowName.totalHeadphones, 0)} sluchátek` : ''}
        </div>
      </div>

      ${renderRankingTable(
        'Žebříček podle dne v týdnu',
        weekdayRows,
        'Den v týdnu'
      )}

      ${renderRankingTable(
        'Žebříček podle začátku pořadu',
        startTimeRows,
        'Začátek pořadu'
      )}

      ${renderRankingTable(
        'Žebříček podle názvu pořadu',
        showNameRows,
        'Pořad'
      )}

      <h3 class="stats-subtitle">Jednotlivé záznamy</h3>

      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Čas</th>
              <th>Pořad</th>
              <th>Typ</th>
              <th>Sluchátka</th>
            </tr>
          </thead>

          <tbody>
            ${items.map(item => `
              <tr class="${Number.isInteger(item.sluchatka) ? '' : 'stats-missing'}">
                <td>${escapeHtml(isoToCs(item.datumISO))}</td>
                <td>${escapeHtml(item.cas)}</td>
                <td>${escapeHtml(item.nazev)}</td>
                <td>${escapeHtml(
                  item.typ === 'modry'
                    ? 'Školní'
                    : item.typ === 'hnedy'
                      ? 'Veřejnost'
                      : item.typ
                )}</td>

                <td class="${Number.isInteger(item.sluchatka) ? '' : 'stats-missing-cell'}">
                  ${Number.isInteger(item.sluchatka) ? item.sluchatka : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h3 class="stats-subtitle">Detailní souhrn podle pořadu</h3>

      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Pořad</th>
              <th>Uvedení</th>
              <th>Se záznamem</th>
              <th>Bez záznamu</th>
              <th>Celkem sluchátek</th>
              <th>Průměr</th>
              <th>Maximum</th>
            </tr>
          </thead>

          <tbody>
            ${titleRows.map(row => `
              <tr>
                <td>${escapeHtml(row.title)}</td>
                <td>${row.total}</td>
                <td>${row.entered}</td>
                <td>${row.missing}</td>
                <td>${formatNumber(row.totalHeadphones, 0)}</td>
                <td>${formatNumber(row.average, 1)}</td>
                <td>${formatNumber(row.max, 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="stats-note">
        Žebříčky jsou řazené podle celkového počtu vydaných sluchátek.
        „—“ znamená, že počet sluchátek nebyl zadán; neinterpretuje se jako nula.
      </div>
    `;

    statsExportBtn.disabled = items.length === 0;
  }

  async function loadStats() {
    if (
      !statsFrom.value ||
      !statsTo.value ||
      statsFrom.value > statsTo.value
    ) {
      statsStatus.textContent = 'Vyber platné období.';
      statsStatus.className = 'stats-status error';
      return;
    }

    statsLoadBtn.disabled = true;
    statsExportBtn.disabled = true;
    statsStatus.textContent = 'Načítám data z Firestore…';
    statsStatus.className = 'stats-status';
    statsResults.innerHTML = '';

    try {
      statsData = await fetchAllShows();
      renderStats();

      statsStatus.textContent =
        `Načteno ${statsFiltered().length} pořadů za období ` +
        `${isoToCs(statsFrom.value)} – ${isoToCs(statsTo.value)}.`;

    } catch (error) {
      console.error(error);
      statsStatus.textContent =
        'Statistiky se nepodařilo načíst: ' + error.message;
      statsStatus.className = 'stats-status error';

    } finally {
      statsLoadBtn.disabled = false;
    }
  }

  function csvValue(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  function exportStatsCsv() {
    const items = statsFiltered();
    if (!items.length) return;

    const rows = [
      ['Datum', 'Čas', 'Pořad', 'Typ', 'Počet sluchátek'],

      ...items.map(item => [
        isoToCs(item.datumISO),
        item.cas,
        item.nazev,
        item.typ === 'modry'
          ? 'Školní'
          : item.typ === 'hnedy'
            ? 'Veřejnost'
            : item.typ,
        Number.isInteger(item.sluchatka)
          ? item.sluchatka
          : ''
      ])
    ];

    const csv = rows
      .map(row => row.map(csvValue).join(';'))
      .join('\r\n');

    const blob = new Blob(
      ['\uFEFF', csv],
      { type: 'text/csv;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download =
      `sluchatka_${statsFrom.value}_${statsTo.value}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }

  function openStats() {
    statsPanel.hidden = false;

    if (!statsFrom.value) {
      statsFrom.value = firstDayOfMonth();
    }

    if (!statsTo.value) {
      statsTo.value = lastDayOfMonth();
    }
  }

  function closeStats() {
    statsPanel.hidden = true;
  }

  headphonesInput.addEventListener('input', () => {
    headphonesInput.value =
      headphonesInput.value
        .replace(/\D/g, '')
        .slice(0, 3);
  });

  headphonesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveHeadphones();
    }
  });

  showSelect.addEventListener(
    'change',
    updateSelectedShow
  );

  saveBtn.addEventListener(
    'click',
    saveHeadphones
  );

  editBtn.addEventListener(
    'click',
    unlockEditing
  );

  refreshBtn.addEventListener(
    'click',
    load
  );

  changeDateBtn.addEventListener(
    'click',
    openDatePicker
  );

  datePickerCloseBtn.addEventListener(
    'click',
    closeDatePicker
  );

  datePickerApplyBtn.addEventListener(
    'click',
    applySelectedDate
  );

  statsBtn.addEventListener(
    'click',
    openStats
  );

  statsCloseBtn.addEventListener(
    'click',
    closeStats
  );

  statsLoadBtn.addEventListener(
    'click',
    loadStats
  );

  statsExportBtn.addEventListener(
    'click',
    exportStatsCsv
  );

  function refreshStatsAfterFilterChange() {
    if (statsData.length) {
      renderStats();

      statsStatus.textContent =
        `Zobrazeno ${statsFiltered().length} pořadů za období ` +
        `${isoToCs(statsFrom.value)} – ${isoToCs(statsTo.value)}.`;
    }
  }

  statsFilter.addEventListener(
    'change',
    refreshStatsAfterFilterChange
  );

  statsTypeFilter.addEventListener(
    'change',
    refreshStatsAfterFilterChange
  );

  load();
})();

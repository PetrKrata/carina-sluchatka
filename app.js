(() => {
  'use strict';

  const PROJECT_ID = 'carina-sluchatka';
  const DATABASE_ID = '(default)';
  const COLLECTION = 'porady';

  const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

  const dateLabel = document.getElementById('dateLabel');
  const showSelect = document.getElementById('showSelect');
  const showMeta = document.getElementById('showMeta');
  const headphonesInput = document.getElementById('headphonesInput');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const refreshBtn = document.getElementById('refreshBtn');
  const changeShowBtn = document.getElementById('changeShowBtn');

  let todayShows = [];

  function localISODate(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function formatDateCs(date = new Date()) {
    return date.toLocaleDateString('cs-CZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function minutesOfTime(time) {
    const [h, m] = String(time).split(':').map(Number);
    return h * 60 + m;
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

  async function fetchTodayShows() {
    const dateISO = localISODate();

    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
      `/databases/${encodeURIComponent(DATABASE_ID)}/documents:runQuery`;

    // DŮLEŽITÉ:
    // Dotaz filtruje pouze podle datumISO.
    // Řazení podle času provedeme až v JavaScriptu,
    // takže Firestore nepotřebuje kompozitní index.
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
      saveBtn.disabled = true;
      headphonesInput.disabled = true;
      showMeta.textContent = '';
      return;
    }

    showSelect.disabled = false;
    saveBtn.disabled = false;
    headphonesInput.disabled = false;

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

  function updateSelectedShow() {
    const show = selectedShow();

    if (!show) {
      showMeta.textContent = '';
      headphonesInput.value = '';
      return;
    }

    showMeta.textContent =
      show.typ === 'modry' ? 'Modrý pořad' :
      show.typ === 'hnedy' ? 'Hnědý pořad' : '';

    headphonesInput.value =
      Number.isInteger(show.sluchatka) ? String(show.sluchatka) : '';

    setStatus('', 'info');

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
        throw new Error('Kontrolní čtení po zápisu neodpovídá zadanému počtu.');
      }

      show.sluchatka = count;
      setStatus(`✓ Uloženo: ${count}`, 'ok');
    } catch (error) {
      console.error(error);
      setStatus('Uložení se nepodařilo.', 'error');
      alert('Uložení se nepodařilo:\n\n' + error.message);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function load() {
    dateLabel.textContent = formatDateCs();
    setStatus('Načítám dnešní pořady…', 'info');

    try {
      const currentId = showSelect.value || null;
      todayShows = await fetchTodayShows();
      renderShows(currentId);

      if (todayShows.length) {
        setStatus(`Načteno pořadů: ${todayShows.length}`, 'info');
      } else {
        setStatus('Pro dnešek nejsou ve Firestore žádné aktivní pořady.', 'error');
      }
    } catch (error) {
      console.error(error);
      setStatus('Pořady se nepodařilo načíst.', 'error');
      alert('Pořady se nepodařilo načíst:\n\n' + error.message);
    }
  }

  headphonesInput.addEventListener('input', () => {
    headphonesInput.value = headphonesInput.value.replace(/\D/g, '').slice(0, 3);
  });

  headphonesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveHeadphones();
    }
  });

  showSelect.addEventListener('change', updateSelectedShow);
  saveBtn.addEventListener('click', saveHeadphones);
  refreshBtn.addEventListener('click', load);

  changeShowBtn.addEventListener('click', () => {
    showSelect.focus();
    showSelect.click();
  });

  load();
})();

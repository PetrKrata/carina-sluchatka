(() => {
  'use strict';

  const PROJECT_ID = 'carina-sluchatka';
  const DATABASE_ID = '(default)';
  const COLLECTION = 'porady';

  // PIN chrání jen proti běžnému / náhodnému přepsání.
  // Protože jde o klientský JavaScript, není to plnohodnotné zabezpečení.
  const EDIT_PIN = '123258';

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
  const changeShowBtn = document.getElementById('changeShowBtn');

  let todayShows = [];
  let editingUnlocked = false;

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
      show.typ === 'modry' ? 'Modrý pořad' :
      show.typ === 'hnedy' ? 'Hnědý pořad' : '';

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

    if (pin === null) {
      return;
    }

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

      // Když šlo o editaci a zápis selhal, editace zůstane odemčená.
      if (editingUnlocked) {
        saveBtn.hidden = false;
        saveBtn.disabled = false;
        editBtn.hidden = true;
      }
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
        const show = selectedShow();

        if (!Number.isInteger(show?.sluchatka)) {
          setStatus(`Načteno pořadů: ${todayShows.length}`, 'info');
        }
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
    headphonesInput.value =
      headphonesInput.value.replace(/\D/g, '').slice(0, 3);
  });

  headphonesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveHeadphones();
    }
  });

  showSelect.addEventListener('change', updateSelectedShow);
  saveBtn.addEventListener('click', saveHeadphones);
  editBtn.addEventListener('click', unlockEditing);
  refreshBtn.addEventListener('click', load);

  changeShowBtn.addEventListener('click', () => {
    showSelect.focus();
    showSelect.click();
  });

  load();
})();

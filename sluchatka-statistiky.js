(async function () {
    'use strict';

    // =========================================================
    // SLUCHÁTKA – STATISTIKY A EXPORT Z FIRESTORE
    // Samostatný panel, spouštěný z bookmarkletu / GitHub JS.
    // =========================================================

    const PANEL_ID = 'sluchatka-statistiky-panel';
    const STYLE_ID = 'sluchatka-statistiky-style';

    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();

    const PROJECT_ID = 'carina-sluchatka';
    const DATABASE_ID = '(default)';
    const COLLECTION = 'porady';

    const FIRESTORE_BASE =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
        `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

    // ---------------------------------------------------------
    // Pomocné funkce
    // ---------------------------------------------------------

    function esc(text) {
        return String(text ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function localISO(date = new Date()) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function prvniDenMesice(date = new Date()) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            '01'
        ].join('-');
    }

    function posledniDenMesice(date = new Date()) {
        const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return localISO(d);
    }

    function datumCs(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}.${m}.${y}`;
    }

    function casNaMinuty(cas) {
        const [h, m] = String(cas || '').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
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
        return decodeURIComponent(String(name || '').split('/').pop());
    }

    function formatNumber(value, maxDigits = 1) {
        if (value == null || Number.isNaN(value)) return '—';
        return Number(value).toLocaleString('cs-CZ', {
            maximumFractionDigits: maxDigits
        });
    }

    function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
        const blob = new Blob(['\uFEFF', text], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function csvValue(value) {
        return `"${String(value ?? '').replaceAll('"', '""')}"`;
    }

    // ---------------------------------------------------------
    // Firestore – načtení celé kolekce po stránkách
    // ---------------------------------------------------------

    async function nactiVsechnyPorady() {
        const vysledek = [];
        let pageToken = '';

        do {
            const url = new URL(`${FIRESTORE_BASE}/${COLLECTION}`);
            url.searchParams.set('pageSize', '1000');
            url.searchParams.set('orderBy', 'datumISO');

            if (pageToken) {
                url.searchParams.set('pageToken', pageToken);
            }

            const response = await fetch(url.toString(), {
                method: 'GET'
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Firestore HTTP ${response.status}: ${body}`);
            }

            const data = await response.json();

            for (const doc of data.documents || []) {
                const f = doc.fields || {};

                vysledek.push({
                    id: documentId(doc.name),
                    datumISO: fieldString(f, 'datumISO'),
                    datum: fieldString(f, 'datum'),
                    cas: fieldString(f, 'cas'),
                    nazev: fieldString(f, 'nazev'),
                    typ: fieldString(f, 'typ'),
                    aktivni: fieldBool(f, 'aktivni'),
                    sluchatka: fieldInteger(f, 'sluchatka'),
                    sluchatkaAktualizovano:
                        f?.sluchatkaAktualizovano?.timestampValue || ''
                });
            }

            pageToken = data.nextPageToken || '';

        } while (pageToken);

        return vysledek;
    }

    // ---------------------------------------------------------
    // CSS
    // ---------------------------------------------------------

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID} {
    position: fixed;
    z-index: 2147483647;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 40px);
    max-width: 1250px;
    max-height: calc(100vh - 40px);
    overflow: auto;
    background: white;
    color: #20242a;
    border: 1px solid #aaa;
    border-radius: 10px;
    box-shadow: 0 8px 35px rgba(0,0,0,.35);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .hlavicka {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #20242a;
    color: white;
}
#${PANEL_ID} .hlavicka h2 {
    margin: 0;
    margin-right: auto;
    font-size: 18px;
}
#${PANEL_ID} .zavrit {
    border: 0;
    background: transparent;
    color: white;
    font-size: 24px;
    cursor: pointer;
}
#${PANEL_ID} .obsah { padding: 16px; }
#${PANEL_ID} .ovladani {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: end;
    padding: 14px;
    background: #f1f3f5;
    border-radius: 8px;
}
#${PANEL_ID} label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-weight: 600;
}
#${PANEL_ID} input, #${PANEL_ID} button, #${PANEL_ID} select {
    font: inherit;
}
#${PANEL_ID} input[type="date"], #${PANEL_ID} select {
    padding: 8px;
    border: 1px solid #aaa;
    border-radius: 5px;
    background: white;
}
#${PANEL_ID} .akce {
    padding: 9px 14px;
    border: 0;
    border-radius: 5px;
    background: #1763a8;
    color: white;
    font-weight: bold;
    cursor: pointer;
}
#${PANEL_ID} .akce.export {
    background: #277447;
}
#${PANEL_ID} .akce:disabled {
    opacity: .55;
    cursor: wait;
}
#${PANEL_ID} .stav {
    margin: 14px 0;
    padding: 9px 11px;
    background: #eef2f6;
    border-radius: 5px;
}
#${PANEL_ID} .stav.chyba {
    background: #ffe4e4;
    color: #900;
}
#${PANEL_ID} .karty {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
    gap: 10px;
    margin: 16px 0;
}
#${PANEL_ID} .karta {
    padding: 12px;
    border: 1px solid #d6dce3;
    border-radius: 8px;
    background: #eef3f8;
}
#${PANEL_ID} .karta strong {
    display: block;
    font-size: 25px;
    margin-top: 5px;
}
#${PANEL_ID} .tabulka-wrap {
    overflow-x: auto;
}
#${PANEL_ID} table {
    width: 100%;
    border-collapse: collapse;
}
#${PANEL_ID} th, #${PANEL_ID} td {
    padding: 7px 9px;
    border-bottom: 1px solid #ddd;
    text-align: left;
    white-space: nowrap;
}
#${PANEL_ID} th {
    background: #e5e7eb;
    position: sticky;
    top: 47px;
}
#${PANEL_ID} tr.nezadano {
    background: #fff8dc;
}
#${PANEL_ID} .nezadano-text {
    color: #946200;
    font-weight: bold;
}
#${PANEL_ID} .stat-po-poradech {
    margin-top: 24px;
}
#${PANEL_ID} .stat-po-poradech h3 {
    margin-bottom: 8px;
}
#${PANEL_ID} .malym {
    color: #666;
    font-size: 12px;
}
@media (max-width: 750px) {
    #${PANEL_ID} {
        top: 8px;
        width: calc(100% - 14px);
        max-height: calc(100vh - 16px);
    }
    #${PANEL_ID} .ovladani {
        align-items: stretch;
    }
    #${PANEL_ID} .ovladani > * {
        flex: 1 1 180px;
    }
}
`;
    document.head.appendChild(style);

    // ---------------------------------------------------------
    // Panel
    // ---------------------------------------------------------

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <div class="hlavicka">
            <h2>Sluchátka – statistiky a export</h2>
            <button class="zavrit" title="Zavřít">×</button>
        </div>

        <div class="obsah">
            <div class="ovladani">
                <label>
                    Od:
                    <input id="sl-stat-od" type="date" value="${prvniDenMesice()}">
                </label>

                <label>
                    Do:
                    <input id="sl-stat-do" type="date" value="${posledniDenMesice()}">
                </label>

                <label>
                    Zobrazit:
                    <select id="sl-stat-filtr">
                        <option value="vse">Všechny pořady</option>
                        <option value="zadane">Pouze se zadaným počtem</option>
                        <option value="nezadane">Pouze bez záznamu</option>
                    </select>
                </label>

                <button id="sl-stat-nacist" class="akce" type="button">
                    NAČÍST STATISTIKY
                </button>

                <button id="sl-stat-export" class="akce export" type="button" disabled>
                    EXPORT CSV
                </button>
            </div>

            <div id="sl-stat-stav" class="stav">
                Vyber období a načti statistiky.
            </div>

            <div id="sl-stat-vysledky"></div>
        </div>
    `;

    document.body.appendChild(panel);

    const odInput = panel.querySelector('#sl-stat-od');
    const doInput = panel.querySelector('#sl-stat-do');
    const filtrSelect = panel.querySelector('#sl-stat-filtr');
    const nacistButton = panel.querySelector('#sl-stat-nacist');
    const exportButton = panel.querySelector('#sl-stat-export');
    const stav = panel.querySelector('#sl-stat-stav');
    const vysledky = panel.querySelector('#sl-stat-vysledky');

    let nactenePorady = [];

    function nastavStav(text, chyba = false) {
        stav.textContent = text;
        stav.className = chyba ? 'stav chyba' : 'stav';
    }

    function vybranePorady() {
        const od = odInput.value;
        const doDatum = doInput.value;
        const filtr = filtrSelect.value;

        return nactenePorady
            .filter(p => p.datumISO >= od && p.datumISO <= doDatum)
            .filter(p => {
                if (filtr === 'zadane') return Number.isInteger(p.sluchatka);
                if (filtr === 'nezadane') return !Number.isInteger(p.sluchatka);
                return true;
            })
            .sort((a, b) =>
                a.datumISO.localeCompare(b.datumISO) ||
                casNaMinuty(a.cas) - casNaMinuty(b.cas) ||
                a.nazev.localeCompare(b.nazev, 'cs')
            );
    }

    function vypoctiSouhrn(porady) {
        const zadane = porady.filter(p => Number.isInteger(p.sluchatka));
        const nezadane = porady.length - zadane.length;
        const soucet = zadane.reduce((s, p) => s + p.sluchatka, 0);
        const prumer = zadane.length ? soucet / zadane.length : null;
        const maximum = zadane.length
            ? Math.max(...zadane.map(p => p.sluchatka))
            : null;

        return {
            celkem: porady.length,
            zadane: zadane.length,
            nezadane,
            soucet,
            prumer,
            maximum
        };
    }

    function vykresli() {
        const porady = vybranePorady();
        const s = vypoctiSouhrn(porady);

        const podleNazvu = new Map();

        for (const p of porady) {
            const key = p.nazev.trim().replace(/\s+/g, ' ');
            if (!podleNazvu.has(key)) {
                podleNazvu.set(key, []);
            }
            podleNazvu.get(key).push(p);
        }

        const statistikaPoradu = [...podleNazvu]
            .map(([nazev, items]) => {
                const ss = vypoctiSouhrn(items);
                return { nazev, ...ss };
            })
            .sort((a, b) =>
                b.soucet - a.soucet ||
                a.nazev.localeCompare(b.nazev, 'cs')
            );

        vysledky.innerHTML = `
            <div class="karty">
                <div class="karta">
                    Pořadů celkem
                    <strong>${s.celkem}</strong>
                </div>
                <div class="karta">
                    Se zadaným počtem
                    <strong>${s.zadane}</strong>
                </div>
                <div class="karta">
                    Bez záznamu
                    <strong>${s.nezadane}</strong>
                </div>
                <div class="karta">
                    Celkem půjčeno
                    <strong>${formatNumber(s.soucet, 0)}</strong>
                </div>
                <div class="karta">
                    Průměr na zadaný pořad
                    <strong>${formatNumber(s.prumer, 1)}</strong>
                </div>
                <div class="karta">
                    Maximum
                    <strong>${formatNumber(s.maximum, 0)}</strong>
                </div>
            </div>

            <div class="tabulka-wrap">
                <table>
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
                        ${porady.map(p => `
                            <tr class="${Number.isInteger(p.sluchatka) ? '' : 'nezadano'}">
                                <td>${esc(datumCs(p.datumISO))}</td>
                                <td>${esc(p.cas)}</td>
                                <td>${esc(p.nazev)}</td>
                                <td>${esc(p.typ === 'modry' ? 'modrý' : p.typ === 'hnedy' ? 'hnědý' : p.typ)}</td>
                                <td class="${Number.isInteger(p.sluchatka) ? '' : 'nezadano-text'}">
                                    ${Number.isInteger(p.sluchatka) ? esc(p.sluchatka) : '—'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="stat-po-poradech">
                <h3>Souhrn podle pořadu</h3>
                <div class="tabulka-wrap">
                    <table>
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
                            ${statistikaPoradu.map(r => `
                                <tr>
                                    <td>${esc(r.nazev)}</td>
                                    <td>${r.celkem}</td>
                                    <td>${r.zadane}</td>
                                    <td>${r.nezadane}</td>
                                    <td>${formatNumber(r.soucet, 0)}</td>
                                    <td>${formatNumber(r.prumer, 1)}</td>
                                    <td>${formatNumber(r.maximum, 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <p class="malym">
                „—“ znamená, že počet sluchátek nebyl zadán. Neinterpretuje se jako nula.
            </p>
        `;

        exportButton.disabled = porady.length === 0;
    }

    async function nacti() {
        const od = odInput.value;
        const doDatum = doInput.value;

        if (!od || !doDatum || od > doDatum) {
            nastavStav('Vyber platné období. Datum Od musí být nejpozději datum Do.', true);
            return;
        }

        nacistButton.disabled = true;
        exportButton.disabled = true;
        nastavStav('Načítám data z Firestore…');
        vysledky.innerHTML = '';

        try {
            const vsechny = await nactiVsechnyPorady();

            // Do statistik zahrnujeme všechny záznamy v období.
            // I neaktivní, pokud leží ve vybraném období – historie tak nezmizí.
            nactenePorady = vsechny;

            vykresli();

            const porady = vybranePorady();
            nastavStav(
                `Načteno ${porady.length} pořadů za období ` +
                `${datumCs(od)} – ${datumCs(doDatum)}.`
            );

        } catch (error) {
            console.error(error);
            nastavStav('Statistiky se nepodařilo načíst: ' + error.message, true);
        } finally {
            nacistButton.disabled = false;
        }
    }

    function exportCsv() {
        const porady = vybranePorady();

        if (!porady.length) {
            return;
        }

        const radky = [
            ['Datum', 'Čas', 'Pořad', 'Typ', 'Počet sluchátek'],
            ...porady.map(p => [
                datumCs(p.datumISO),
                p.cas,
                p.nazev,
                p.typ === 'modry' ? 'modrý' :
                p.typ === 'hnedy' ? 'hnědý' : p.typ,
                Number.isInteger(p.sluchatka) ? p.sluchatka : ''
            ])
        ];

        const csv = radky
            .map(radek => radek.map(csvValue).join(';'))
            .join('\r\n');

        const filename =
            `sluchatka_${odInput.value}_${doInput.value}.csv`;

        downloadText(filename, csv);
    }

    // ---------------------------------------------------------
    // Události
    // ---------------------------------------------------------

    panel.querySelector('.zavrit').addEventListener('click', () => {
        panel.remove();
        style.remove();
    });

    nacistButton.addEventListener('click', nacti);
    exportButton.addEventListener('click', exportCsv);

    filtrSelect.addEventListener('change', () => {
        if (nactenePorady.length) {
            vykresli();
            const porady = vybranePorady();
            nastavStav(
                `Zobrazeno ${porady.length} pořadů za období ` +
                `${datumCs(odInput.value)} – ${datumCs(doInput.value)}.`
            );
        }
    });

})();

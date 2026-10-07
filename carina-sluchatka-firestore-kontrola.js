(async function () {
    'use strict';

    // =========================================================
    // CARINA -> FIRESTORE
    // Synchronizace MODRÝCH a HNĚDÝCH pořadů z právě otevřeného měsíce.
    //
    // Firestore:
    // projekt: carina-sluchatka
    // kolekce: porady
    //
    // Existující údaje, které později přidáme k pořadu
    // (např. počet sluchátek), tento skript nemaže.
    // Zrušený pořad pouze označí aktivni = false.
    // =========================================================

    const FIREBASE = {
        apiKey: "AIzaSyCig-Pvk1WNgBMgRndrWt0un77WUwv7upA",
        authDomain: "carina-sluchatka.firebaseapp.com",
        projectId: "carina-sluchatka",
        storageBucket: "carina-sluchatka.firebasestorage.app",
        messagingSenderId: "110462366708",
        appId: "1:110462366708:web:4da880129b9083015c3fa1"
    };

    const PROJECT_ID = FIREBASE.projectId;
    const DATABASE_ID = '(default)';
    const COLLECTION = 'porady';

    const FIRESTORE_BASE =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
        `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

    // ---------------------------------------------------------
    // Pomocné funkce pro mřížku Cariny
    // ---------------------------------------------------------

    function gridRowStart(element) {
        let row = parseInt(element.style.gridRowStart, 10);
        if (row) return row;

        const raw = element.style.gridRow || '';
        row = parseInt(raw.split('/')[0], 10);
        return row || null;
    }

    function gridColumnBounds(element) {
        let start = parseInt(element.style.gridColumnStart, 10);
        let end = parseInt(element.style.gridColumnEnd, 10);

        if (start && end) return { start, end };

        const raw = element.style.gridColumn || '';
        const parts = raw.split('/').map(value => parseInt(value.trim(), 10));

        start = start || parts[0];
        end = end || parts[1];

        return { start, end };
    }

    function sloupecNaCas(column) {
        const minuty = (8 * 60) + ((column - 2) * 15);
        const hodiny = Math.floor(minuty / 60);
        const mins = minuty % 60;

        return (
            String(hodiny).padStart(2, '0') +
            ':' +
            String(mins).padStart(2, '0')
        );
    }

    // ---------------------------------------------------------
    // Rozpoznání MODRÝCH a HNĚDÝCH pořadů
    // ---------------------------------------------------------

    function typPoradu(show) {
        const styleText = (show.getAttribute('style') || '')
            .toLowerCase()
            .replace(/\s/g, '');

        const barva = (show.style.backgroundColor || '')
            .toLowerCase()
            .replace(/\s/g, '');

        // MODRÁ #000075
        if (
            styleText.includes('background-color:#000075') ||
            barva === '#000075' ||
            barva === 'rgb(0,0,117)'
        ) {
            return 'modry';
        }

        // HNĚDÁ #800000
        if (
            styleText.includes('background-color:#800000') ||
            barva === '#800000' ||
            barva === 'rgb(128,0,0)'
        ) {
            return 'hnedy';
        }

        return null;
    }

    // ---------------------------------------------------------
    // Datum
    // ---------------------------------------------------------

    function datumNaISO(datum) {
        const cisla = String(datum).match(/\d+/g) || [];
        if (cisla.length < 3) return '';

        const den = Number(cisla[0]);
        const mesic = Number(cisla[1]);
        const rok = Number(cisla[2]);

        if (!den || !mesic || !rok) return '';

        return (
            String(rok).padStart(4, '0') + '-' +
            String(mesic).padStart(2, '0') + '-' +
            String(den).padStart(2, '0')
        );
    }

    function otevrenyMesic() {
        try {
            const url = new URL(window.location.href);
            const rok = Number(url.searchParams.get('year'));
            const mesic = Number(url.searchParams.get('month'));

            if (rok && mesic >= 1 && mesic <= 12) {
                return `${rok}-${String(mesic).padStart(2, '0')}`;
            }
        } catch (e) {}

        return '';
    }

    // ---------------------------------------------------------
    // Stabilní ID dokumentu
    // ---------------------------------------------------------

    function jednoduchyHash(text) {
        let hash = 2166136261;

        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function idPoradu(porad) {
        if (porad.uuid) {
            return 'carina_' + String(porad.uuid)
                .replace(/[^a-zA-Z0-9_-]/g, '_');
        }

        return 'fallback_' + jednoduchyHash(
            `${porad.datumISO}|${porad.cas}|${porad.nazev}`
        );
    }

    // ---------------------------------------------------------
    // Firestore REST pomocné funkce
    // ---------------------------------------------------------

    function firestoreFields(porad) {
        return {
            datum: { stringValue: porad.datum },
            datumISO: { stringValue: porad.datumISO },
            cas: { stringValue: porad.cas },
            nazev: { stringValue: porad.nazev },
            typ: { stringValue: porad.typ },
            mesic: { stringValue: porad.mesic },
            uuid: { stringValue: porad.uuid || '' },
            aktivni: { booleanValue: true },
            zdroj: { stringValue: 'Carina' },
            aktualizovano: { timestampValue: new Date().toISOString() }
        };
    }

    async function ulozPorad(porad) {
        const docId = idPoradu(porad);

        const fieldPaths = [
            'datum',
            'datumISO',
            'cas',
            'nazev',
            'typ',
            'mesic',
            'uuid',
            'aktivni',
            'zdroj',
            'aktualizovano'
        ];

        const query = fieldPaths
            .map(field => 'updateMask.fieldPaths=' + encodeURIComponent(field))
            .join('&');

        const url =
            `${FIRESTORE_BASE}/${COLLECTION}/${encodeURIComponent(docId)}?${query}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: firestoreFields(porad)
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Firestore zápis ${docId}: HTTP ${response.status}\n${text}`
            );
        }

        return docId;
    }

    async function nactiDokumentyMesice(mesic) {
        const url =
            `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
            `/databases/${encodeURIComponent(DATABASE_ID)}/documents:runQuery`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [
                        { collectionId: COLLECTION }
                    ],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'mesic' },
                            op: 'EQUAL',
                            value: { stringValue: mesic }
                        }
                    }
                }
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Firestore čtení měsíce: HTTP ${response.status}\n${text}`
            );
        }

        const rows = await response.json();

        return rows
            .filter(row => row.document)
            .map(row => {
                const name = row.document.name || '';
                const docId = decodeURIComponent(name.split('/').pop());

                return {
                    docId,
                    document: row.document
                };
            });
    }

    async function oznacNeaktivni(docId) {
        const url =
            `${FIRESTORE_BASE}/${COLLECTION}/${encodeURIComponent(docId)}` +
            `?updateMask.fieldPaths=aktivni&updateMask.fieldPaths=aktualizovano`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    aktivni: { booleanValue: false },
                    aktualizovano: { timestampValue: new Date().toISOString() }
                }
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Firestore deaktivace ${docId}: HTTP ${response.status}\n${text}`
            );
        }
    }

    // ---------------------------------------------------------
    // 1. Zjištění data podle řádku
    // ---------------------------------------------------------

    const dnyPodleRadku = new Map();

    document
        .querySelectorAll('.day[data-date]')
        .forEach(day => {
            const row = gridRowStart(day);
            const datum = day.dataset.date;

            if (row && datum) {
                dnyPodleRadku.set(row, datum);
            }
        });

    if (dnyPodleRadku.size === 0) {
        alert(
            'Nenalezl jsem měsíční kalendář Cariny.\n\n' +
            'Otevři prosím měsíční rozvrh a spusť skript znovu.'
        );
        return;
    }

    // ---------------------------------------------------------
    // 2. Načtení modrých + hnědých pořadů
    // ---------------------------------------------------------

    const porady = [];

    document
        .querySelectorAll('.show')
        .forEach(show => {
            const typ = typPoradu(show);
            if (!typ) return;

            const nameElement = show.querySelector('.name');
            if (!nameElement) return;

            const nazev = nameElement.textContent.trim();
            if (!nazev) return;

            const row = gridRowStart(show);
            const columns = gridColumnBounds(show);

            if (!row || !columns.start) return;

            const datum = dnyPodleRadku.get(row);
            if (!datum) return;

            const datumISO = datumNaISO(datum);
            if (!datumISO) return;

            const cas = sloupecNaCas(columns.start);
            const uuid = show.dataset.uuid || '';

            porady.push({
                datum,
                datumISO,
                cas,
                nazev,
                typ,
                uuid,
                mesic: datumISO.slice(0, 7)
            });
        });

    if (porady.length === 0) {
        alert(
            'V otevřeném měsíci nebyly nalezeny žádné modré ani hnědé pořady.'
        );
        return;
    }

    // Pokud by DOM obsahoval stejný pořad vícekrát, ponecháme jeden.
    const jedinecnePorady = [
        ...new Map(
            porady.map(porad => [idPoradu(porad), porad])
        ).values()
    ];

    // Měsíc vezmeme primárně z dat; URL slouží jako kontrola.
    const mesice = [...new Set(jedinecnePorady.map(p => p.mesic))];

    if (mesice.length !== 1) {
        alert(
            'Skript našel pořady z více než jednoho měsíce.\n\n' +
            'Otevři prosím standardní měsíční pohled Cariny.'
        );
        return;
    }

    const mesic = mesice[0];
    const mesicURL = otevrenyMesic();

    if (mesicURL && mesicURL !== mesic) {
        console.warn(
            'Carina: měsíc v URL neodpovídá nalezeným datům:',
            mesicURL,
            mesic
        );
    }

    // ---------------------------------------------------------
    // 3. Potvrzení
    // ---------------------------------------------------------

    const modre = jedinecnePorady.filter(p => p.typ === 'modry').length;
    const hnede = jedinecnePorady.filter(p => p.typ === 'hnedy').length;

    const potvrdit = confirm(
        `Synchronizovat pořady ${mesic} do Firestore?\n\n` +
        `Modré: ${modre}\n` +
        `Hnědé: ${hnede}\n` +
        `Celkem: ${jedinecnePorady.length}\n\n` +
        `Existující počty sluchátek se nepřepíšou.`
    );

    if (!potvrdit) return;

    // ---------------------------------------------------------
    // 4. Zápis
    // ---------------------------------------------------------

    const uspesneIDs = new Set();
    const chyby = [];

    // Píšeme po menších skupinách, aby nebyl prohlížeč zahlcen.
    const DAVKA = 10;

    for (let i = 0; i < jedinecnePorady.length; i += DAVKA) {
        const davka = jedinecnePorady.slice(i, i + DAVKA);

        const vysledky = await Promise.allSettled(
            davka.map(async porad => {
                const docId = await ulozPorad(porad);
                return { docId, porad };
            })
        );

        vysledky.forEach(vysledek => {
            if (vysledek.status === 'fulfilled') {
                uspesneIDs.add(vysledek.value.docId);
            } else {
                chyby.push(vysledek.reason);
                console.error(vysledek.reason);
            }
        });
    }

    // ---------------------------------------------------------
    // 5. Pořady, které z Cariny zmizely, pouze deaktivujeme
    // ---------------------------------------------------------

    let deaktivovano = 0;

    try {
        const existujici = await nactiDokumentyMesice(mesic);

        const stareDokumenty = existujici.filter(
            item => !uspesneIDs.has(item.docId)
        );

        for (let i = 0; i < stareDokumenty.length; i += DAVKA) {
            const davka = stareDokumenty.slice(i, i + DAVKA);

            const vysledky = await Promise.allSettled(
                davka.map(item => oznacNeaktivni(item.docId))
            );

            vysledky.forEach((vysledek, index) => {
                if (vysledek.status === 'fulfilled') {
                    deaktivovano++;
                } else {
                    chyby.push(vysledek.reason);
                    console.error(vysledek.reason);
                }
            });
        }
    } catch (error) {
        chyby.push(error);
        console.error(error);
    }


    // ---------------------------------------------------------
    // 6. Ověření zápisu
    // ---------------------------------------------------------

    async function nactiDokument(docId) {
        const url =
            `${FIRESTORE_BASE}/${COLLECTION}/${encodeURIComponent(docId)}`;

        const response = await fetch(url, {
            method: 'GET'
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(
                `Ověření dokumentu ${docId}: HTTP ${response.status}\n${body}`
            );
        }

        return await response.json();
    }

    function firestoreString(fields, key) {
        return fields?.[key]?.stringValue ?? '';
    }

    function firestoreBoolean(fields, key) {
        return fields?.[key]?.booleanValue ?? false;
    }

    async function overZapis(porady) {
        const chybyOvereni = [];

        for (const porad of porady) {
            const docId = idPoradu(porad);

            try {
                const doc = await nactiDokument(docId);
                const f = doc.fields || {};

                const ok =
                    firestoreString(f, 'datumISO') === porad.datumISO &&
                    firestoreString(f, 'cas') === porad.cas &&
                    firestoreString(f, 'nazev') === porad.nazev &&
                    firestoreString(f, 'typ') === porad.typ &&
                    firestoreString(f, 'mesic') === porad.mesic &&
                    firestoreBoolean(f, 'aktivni') === true;

                if (!ok) {
                    chybyOvereni.push(
                        `Nesouhlasí data: ${porad.datumISO} ${porad.cas} ${porad.nazev}`
                    );
                }
            } catch (error) {
                chybyOvereni.push(error.message);
            }
        }

        return chybyOvereni;
    }

    const chybyOvereni = await overZapis(jedinecnePorady);

    // ---------------------------------------------------------
    // 7. Hotovo
    // ---------------------------------------------------------

    const vsechnyChyby = [
        ...chyby.map(chyba => chyba?.message || String(chyba)),
        ...chybyOvereni
    ];

    if (vsechnyChyby.length === 0) {
        alert(
            `✅ Synchronizace a kontrola dokončena.\n\n` +
            `Měsíc: ${mesic}\n` +
            `Uloženo / aktualizováno: ${uspesneIDs.size}\n` +
            `Ověřeno: ${jedinecnePorady.length}\n` +
            `Označeno jako zrušené: ${deaktivovano}\n\n` +
            `Všechna data byla po zápisu z Firestore znovu načtena a odpovídají.`
        );
    } else {
        console.error('Chyby synchronizace / ověření:', vsechnyChyby);

        alert(
            `⚠ Synchronizace skončila s problémem.\n\n` +
            `Úspěšně uloženo: ${uspesneIDs.size}\n` +
            `Ověřeno bez chyby: ${jedinecnePorady.length - chybyOvereni.length}\n` +
            `Označeno jako zrušené: ${deaktivovano}\n` +
            `Chyb: ${vsechnyChyby.length}\n\n` +
            `Podrobnosti jsou v konzoli prohlížeče (F12).`
        );
    }

})();

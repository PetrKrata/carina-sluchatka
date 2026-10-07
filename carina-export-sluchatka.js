(async function () {

    // =========================================================
    // CARINA – EXPORT MODRÝCH A HNĚDÝCH POŘADŮ DO CSV
    // =========================================================

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

        if (start && end) {
            return { start, end };
        }

        const raw = element.style.gridColumn || '';
        const parts = raw
            .split('/')
            .map(value => parseInt(value.trim(), 10));

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

    function typPoradu(show) {
        const styleText = (show.getAttribute('style') || '')
            .toLowerCase()
            .replace(/\s/g, '');

        const barva = (show.style.backgroundColor || '')
            .toLowerCase()
            .replace(/\s/g, '');

        // MODRÁ
        if (
            styleText.includes('background-color:#000075') ||
            barva === '#000075' ||
            barva === 'rgb(0,0,117)'
        ) {
            return 'modry';
        }

        // HNĚDÁ
        if (
            styleText.includes('background-color:#800000') ||
            barva === '#800000' ||
            barva === 'rgb(128,0,0)'
        ) {
            return 'hnedy';
        }

        return null;
    }

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

    const porady = [];

    document
        .querySelectorAll('.show')
        .forEach(show => {
            const typ = typPoradu(show);
            if (!typ) return;

            const nameElement = show.querySelector('.name');
            if (!nameElement) return;

            const nazev = nameElement.textContent.trim();
            const row = gridRowStart(show);
            const columns = gridColumnBounds(show);

            if (!row || !columns.start) return;

            const datum = dnyPodleRadku.get(row);
            if (!datum) return;

            const cas = sloupecNaCas(columns.start);

            porady.push({
                datum,
                cas,
                nazev
            });
        });

    function datumNaCislo(datum) {
        const [den, mesic, rok] = datum
            .split('.')
            .map(Number);

        return new Date(
            rok,
            mesic - 1,
            den
        ).getTime();
    }

    function casNaMinuty(cas) {
        const [hodina, minuta] = cas
            .split(':')
            .map(Number);

        return hodina * 60 + minuta;
    }

    porady.sort(
        (a, b) =>
            datumNaCislo(a.datum) - datumNaCislo(b.datum) ||
            casNaMinuty(a.cas) - casNaMinuty(b.cas)
    );

    function csvHodnota(value) {
        const text = String(value ?? '');
        return '"' + text.replaceAll('"', '""') + '"';
    }

    const radky = [
        ['Datum', 'Čas', 'Pořad'],
        ...porady.map(porad => [
            porad.datum,
            porad.cas,
            porad.nazev
        ])
    ];

    const csv = radky
        .map(radek =>
            radek
                .map(csvHodnota)
                .join(';')
        )
        .join('\r\n');

    const blob = new Blob(
        ['\uFEFF', csv],
        { type: 'text/csv;charset=utf-8' }
    );

    let rok = '';
    let mesic = '';

    try {
        const url = new URL(window.location.href);
        rok = url.searchParams.get('year') || '';
        mesic = url.searchParams.get('month') || '';
    } catch (e) {}

    if ((!rok || !mesic) && porady.length) {
        const casti = porady[0]
            .datum
            .split('.')
            .map(Number);

        mesic = String(casti[1]).padStart(2, '0');
        rok = String(casti[2]);
    }

    const filename =
        `carina-porady-${rok}-${String(mesic).padStart(2, '0')}.csv`;

    const odkaz = document.createElement('a');
    odkaz.href = URL.createObjectURL(blob);
    odkaz.download = filename;

    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();

    URL.revokeObjectURL(odkaz.href);

    alert(
        `Export dokončen.\n\n` +
        `Nalezeno pořadů: ${porady.length}\n` +
        `Soubor: ${filename}`
    );

})();

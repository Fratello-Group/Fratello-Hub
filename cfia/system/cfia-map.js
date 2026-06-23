// ═══════════════════════════════════════════════════════════════
// cfia-map.js — the reusable Table-of-Contents + mini search/filter map.
// Used on every department/section page (and the whole-program map).
// renderSystemsMap({ mount, docs, groups }) draws: a TOC, a search box,
// type-filter chips, and the documents grouped by docType.
// ═══════════════════════════════════════════════════════════════
import { escapeHtml } from '/cfia/system/cfia-core.js';

const TYPE_DOT = {
    SOP: 'var(--teal)', Policy: 'var(--teal-dark)', Plan: 'var(--teal)',
    Form: 'var(--pass)', Quiz: '#7F77DD', Training: '#7F77DD',
    JobDescription: 'var(--slate)', Manual: 'var(--due)', Report: 'var(--grey)', Other: 'var(--grey)'
};

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

function rowHtml(d) {
    const dot = TYPE_DOT[d.docType] || 'var(--grey)';
    const code = d.code ? `<span class="map-code">${escapeHtml(d.code)}</span>` : '';
    const bits = [];
    if (d.version) bits.push('v' + escapeHtml(d.version));
    if (d.cadence) bits.push(escapeHtml(d.cadence));
    let tag = '', href = '', cls = 'map-row';
    if (d.rebuild === false && d.link) { tag = '<span class="map-tag hub">Hub tool →</span>'; href = d.link; }
    else if (d.href) { tag = '<span class="map-tag live">Live</span>'; href = d.href; }
    else { tag = '<span class="map-tag pending">Page coming</span>'; cls += ' pending'; }
    const search = (`${d.code || ''} ${d.title} ${d.docType}`).toLowerCase();
    const meta = bits.length ? `<span class="map-meta">${bits.join(' · ')}</span>` : '';
    const inner = `<span class="map-dot" style="background:${dot}"></span>${code}<span class="map-title">${escapeHtml(d.title)}</span>${meta}${tag}`;
    return href
        ? `<a class="${cls}" href="${escapeHtml(href)}" data-type="${escapeHtml(d.docType)}" data-text="${escapeHtml(search)}">${inner}</a>`
        : `<div class="${cls}" data-type="${escapeHtml(d.docType)}" data-text="${escapeHtml(search)}">${inner}</div>`;
}

export function renderSystemsMap({ mount, docs, groups }) {
    const present = groups.filter(g => docs.some(d => d.docType === g.key));

    const chips = `<button class="map-chip on" data-f="all">All <span>${docs.length}</span></button>` +
        present.map(g => {
            const n = docs.filter(d => d.docType === g.key).length;
            return `<button class="map-chip" data-f="${escapeHtml(g.key)}">${escapeHtml(g.label)} <span>${n}</span></button>`;
        }).join('');

    const sections = present.map(g => {
        const rows = docs.filter(d => d.docType === g.key).map(rowHtml).join('');
        return `<section class="map-group" id="grp-${slug(g.key)}" data-group="${escapeHtml(g.key)}">
            <h2 class="map-group-h"><i class="ti ${g.icon}" aria-hidden="true"></i> ${escapeHtml(g.label)}</h2>
            <div class="map-rows">${rows}</div>
        </section>`;
    }).join('');

    mount.innerHTML = `
        <div class="map-controls">
            <input class="map-search" id="mapSearch" type="text" placeholder="Search this area by name or code…" aria-label="Search documents">
            <div class="map-chips">${chips}</div>
        </div>
        <div class="map-body">${sections}</div>`;

    const search = mount.querySelector('#mapSearch');
    const chipsEl = mount.querySelectorAll('.map-chip');
    let f = 'all';
    function apply() {
        const s = (search.value || '').toLowerCase();
        mount.querySelectorAll('.map-row').forEach(r => {
            const okF = (f === 'all' || r.dataset.type === f);
            const okS = (!s || r.dataset.text.indexOf(s) > -1);
            r.style.display = (okF && okS) ? '' : 'none';
        });
        mount.querySelectorAll('.map-group').forEach(g => {
            const any = [...g.querySelectorAll('.map-row')].some(r => r.style.display !== 'none');
            g.style.display = any ? '' : 'none';
        });
    }
    search.addEventListener('input', apply);
    chipsEl.forEach(c => c.addEventListener('click', () => {
        chipsEl.forEach(x => x.classList.remove('on'));
        c.classList.add('on');
        f = c.dataset.f;
        apply();
    }));
}

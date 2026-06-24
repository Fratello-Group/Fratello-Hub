// ═══════════════════════════════════════════════════════════════
// cfia-linkify.js — turn document references inside reference text into
// clickable links, driven by the live document register. Centralized so
// every reference page links consistently — including future content — and
// so a link is only ever created for a document that actually exists.
//
// Two passes:
//   1. Coded references — "SOP-PCP-3.1", "SOP 6.1", "Form 6.3a", "PCP-5.6",
//      "JD-3", "Form E". A doc-prefix is required for bare numeric codes so we
//      never mistake a section number ("2.2 Bag Filling") for a document.
//   2. Named references — a document's exact title, or a known short alias
//      ("Pre-Op SOP", "Approved Supplier List").
// ═══════════════════════════════════════════════════════════════

// Short names that carry no code but always mean a specific document.
const ALIASES = {
    'pre-op sop': '6.3',
    'pre-operational inspection procedure': '6.3',
    'pre-operational inspection checklist': '6.3a',
    'pre-operational inspection log': '6.3a',
    'approved supplier list': '2.2',
    'approved supplier listing': '2.2'
};

const ESC_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ESC_HTML[c]); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function buildLinker(register, currentCode) {
    const byCode = {};
    register.forEach(d => { byCode[d.code] = d; });

    const hrefFor = code => {
        const e = byCode[code];
        if (!e) return null;
        return e.href || `/cfia/reference/view.html?code=${encodeURIComponent(code)}`;
    };
    const resolve = code => {
        if (byCode[code]) return code;
        const dotted = code.replace(/-/g, '.');
        return byCode[dotted] ? dotted : null;
    };

    const codes = register.map(d => d.code);
    const numericCodes = codes.filter(c => /^\d/.test(c)).sort((a, b) => b.length - a.length);
    const prefixedCodes = codes.filter(c => /^[A-Za-z]/.test(c)).sort((a, b) => b.length - a.length);

    const numericRe = numericCodes.length
        ? new RegExp('(?:SOP[-\\s]?PCP[-\\s]?|SOP[-\\s]?|PCP[-\\s]?|Form[-\\s]?)(' + numericCodes.map(escRe).join('|') + ')(?![\\w.])', 'g')
        : null;
    const prefixedRe = prefixedCodes.length
        ? new RegExp('\\b(' + prefixedCodes.map(escRe).join('|') + ')\\b', 'g')
        : null;

    // Named references: distinctive doc titles (≥14 chars) + curated aliases, longest first.
    const named = register
        .filter(d => d.title && d.title.length >= 14)
        .map(d => ({ key: d.title.toLowerCase(), code: d.code }))
        .concat(Object.keys(ALIASES).map(k => ({ key: k, code: ALIASES[k] })))
        .filter(n => byCode[n.code])
        .sort((a, b) => b.key.length - a.key.length);

    function findMatches(text) {
        const lower = text.toLowerCase();
        const matches = [];
        const push = (start, end, rawCode) => {
            const c = resolve(rawCode);
            if (c && c !== currentCode) matches.push({ start, end, code: c, text: text.slice(start, end) });
        };
        if (numericRe) { numericRe.lastIndex = 0; let m; while ((m = numericRe.exec(text))) push(m.index, m.index + m[0].length, m[1]); }
        if (prefixedRe) { prefixedRe.lastIndex = 0; let m; while ((m = prefixedRe.exec(text))) push(m.index, m.index + m[0].length, m[1]); }
        named.forEach(n => {
            let i = 0;
            while ((i = lower.indexOf(n.key, i)) !== -1) {
                const before = i === 0 ? ' ' : text[i - 1];
                const after = (i + n.key.length >= text.length) ? ' ' : text[i + n.key.length];
                if (/[\s(.,;:"'–—]/.test(before) && /[\s).,;:"'–—]/.test(after)) push(i, i + n.key.length, n.code);
                i += n.key.length;
            }
        });
        // Resolve overlaps: earliest start wins; ties → longest match.
        matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
        const chosen = [];
        let lastEnd = -1;
        for (const mt of matches) { if (mt.start >= lastEnd) { chosen.push(mt); lastEnd = mt.end; } }
        return chosen;
    }

    // Plain-text string → HTML with links (null if nothing to link).
    function toHtml(text) {
        const ms = findMatches(text);
        if (!ms.length) return null;
        let out = '', pos = 0;
        for (const mt of ms) {
            out += escHtml(text.slice(pos, mt.start));
            const href = hrefFor(mt.code);
            out += href ? `<a href="${href}">${escHtml(mt.text)}</a>` : escHtml(mt.text);
            pos = mt.end;
        }
        out += escHtml(text.slice(pos));
        return out;
    }

    return { toHtml, findMatches, hrefFor };
}

// Walk an element's text nodes and linkify document references in place.
// Skips text already inside links, headings, code, and buttons.
export function linkifyElement(root, register, currentCode) {
    if (!root) return;
    const linker = buildLinker(register, currentCode);
    const SKIP = { A: 1, H1: 1, H2: 1, H3: 1, CODE: 1, BUTTON: 1 };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            let p = node.parentNode;
            while (p && p !== root) { if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT; p = p.parentNode; }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const targets = [];
    let n; while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(node => {
        const html = linker.toHtml(node.nodeValue);
        if (html == null) return;
        const span = document.createElement('span');
        span.innerHTML = html;
        while (span.firstChild) node.parentNode.insertBefore(span.firstChild, node);
        node.parentNode.removeChild(node);
    });
}

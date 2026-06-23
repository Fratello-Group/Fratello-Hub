// ═══════════════════════════════════════════════════════════════
// fh-render-form.js — THE form engine.
// Builds any CFIA form from a JSON schema. Adding form #N is a config
// entry in config/form-schemas.js, NOT new code. Field types:
//   date · text · select · textarea · status (Pass / Fail / Not in use)
// ═══════════════════════════════════════════════════════════════
import { isoToday, escapeHtml } from '/cfia/system/cfia-core.js';

const STATUS_OPTIONS = [
    { value: 'Pass', cls: 'pass' },
    { value: 'Fail', cls: 'fail' },
    { value: 'Not in use', cls: 'na' }
];

function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
}

function labelHtml(f) {
    const req = f.required ? ' <span class="req">*</span>' : '';
    const help = f.help ? `<div class="field-help">${escapeHtml(f.help)}</div>` : '';
    return { req, help };
}

function renderField(f) {
    const { req, help } = labelHtml(f);

    if (f.type === 'status') {
        const wrap = el('div', 'status-row');
        wrap.dataset.fieldId = f.id;
        wrap.innerHTML = `
            <div class="status-info">
                <div class="field-label">${escapeHtml(f.label)}${req}</div>
                ${help}
            </div>
            <div class="status-opts">
                ${STATUS_OPTIONS.map((o, i) => `
                    <label class="status-opt">
                        <input type="radio" name="${escapeHtml(f.id)}" value="${escapeHtml(o.value)}">
                        <span class="${o.cls}">${escapeHtml(o.value)}</span>
                    </label>`).join('')}
            </div>`;
        return wrap;
    }

    const wrap = el('div', 'field' + (f.full || f.type === 'textarea' ? ' full' : ''));
    let control = '';
    if (f.type === 'textarea') {
        control = `<textarea class="textarea" id="${escapeHtml(f.id)}" placeholder="${escapeHtml(f.placeholder || '')}"></textarea>`;
    } else if (f.type === 'select') {
        const opts = ['<option value="">Select…</option>']
            .concat((f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`));
        control = `<select class="select" id="${escapeHtml(f.id)}">${opts.join('')}</select>`;
    } else if (f.type === 'date') {
        control = `<input class="input" type="date" id="${escapeHtml(f.id)}">`;
    } else {
        control = `<input class="input" type="text" id="${escapeHtml(f.id)}" placeholder="${escapeHtml(f.placeholder || '')}">`;
    }
    wrap.innerHTML = `<label class="field-label" for="${escapeHtml(f.id)}">${escapeHtml(f.label)}${req}</label>${help}${control}`;
    return wrap;
}

function getValue(f, mount) {
    if (f.type === 'status') {
        const checked = mount.querySelector(`input[name="${cssEscape(f.id)}"]:checked`);
        return checked ? checked.value : '';
    }
    const node = mount.querySelector('#' + cssEscape(f.id));
    return node ? node.value.trim() : '';
}

function cssEscape(id) {
    return (window.CSS && CSS.escape) ? CSS.escape(id) : id;
}

// Render the whole form into `mount`. Returns { collect() }.
export function renderForm(schema, mount) {
    mount.innerHTML = '';
    schema.sections.forEach(sec => {
        const panel = el('section', 'cfia-panel');
        panel.appendChild(el('h2', 'panel-title', escapeHtml(sec.title)));
        if (sec.help) panel.appendChild(el('p', 'panel-help', escapeHtml(sec.help)));
        const isStatus = sec.fields.every(f => f.type === 'status');
        const grid = el('div', isStatus ? '' : 'field-grid');
        sec.fields.forEach(f => grid.appendChild(renderField(f)));
        panel.appendChild(grid);
        mount.appendChild(panel);
    });

    // sensible defaults
    schema.sections.forEach(sec => sec.fields.forEach(f => {
        if (f.type === 'date' && f.default === 'today') {
            const node = mount.querySelector('#' + cssEscape(f.id));
            if (node) node.value = isoToday();
        }
    }));

    return {
        collect() {
            const values = {};
            const errors = [];
            schema.sections.forEach(sec => sec.fields.forEach(f => {
                const v = getValue(f, mount);
                values[f.id] = v;
                if (f.required && !v) errors.push(f.label);
            }));
            // any failed checklist item?
            const anyFail = schema.sections.some(sec => sec.fields.some(
                f => f.type === 'status' && values[f.id] === 'Fail'
            ));
            return { values, errors, anyFail };
        }
    };
}

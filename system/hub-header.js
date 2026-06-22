// Shared Fratello Hub header.
//
// Drop this onto any page to get the standard header (logo, nav, profile
// chip, mobile hamburger, sign out). It uses absolute paths so it works at
// any folder depth. Usage on a page:
//   <div id="fratello-hub-header"></div>
//   <script src="/system/hub-header.js"></script>
// If the placeholder div is omitted, the header is prepended to <body>.
(function () {
    var ROLE_KEY = 'fratello-role';

    function readRole() {
        try { return JSON.parse(localStorage.getItem(ROLE_KEY) || 'null'); }
        catch (error) { return null; }
    }

    function initials(name) {
        return (name || '')
            .split(/\s+/).filter(Boolean).slice(0, 2)
            .map(function (part) { return part.charAt(0).toUpperCase(); })
            .join('') || 'TM';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    var CSS = [
        ".fh-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:18px;padding:14px 28px;background:rgba(255,255,255,.97);border-bottom:1px solid #E2E2E4;box-shadow:0 1px 2px rgba(15,17,17,.04);font-family:'Montserrat',sans-serif;box-sizing:border-box;}",
        ".fh-logo{height:30px;width:auto;display:block;}",
        ".fh-nav{display:flex;align-items:center;gap:2px;margin-right:auto;flex-wrap:wrap;}",
        ".fh-nav a{min-height:42px;display:inline-flex;align-items:center;padding:8px 14px;border-bottom:2px solid transparent;color:#5A5A5E;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;white-space:nowrap;}",
        ".fh-nav a:hover{color:#1A1A1A;border-bottom-color:#36B3AF;}",
        ".fh-right{display:flex;align-items:center;gap:12px;}",
        ".fh-chip{display:inline-flex;align-items:center;gap:9px;padding:5px 12px 5px 5px;border:1px solid #E2E2E4;border-radius:6px;background:#fff;}",
        ".fh-avatar{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:3px;background:rgba(54,179,175,.12);border:1px solid rgba(54,179,175,.5);color:#1f7a76;font-size:11px;font-weight:800;letter-spacing:1px;}",
        ".fh-copy{display:flex;flex-direction:column;line-height:1.15;}",
        ".fh-name{font-size:12px;font-weight:800;color:#1A1A1A;}",
        ".fh-access{font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#1f7a76;}",
        ".fh-signout{min-height:40px;padding:0 14px;border:1px solid #E2E2E4;border-radius:6px;background:transparent;color:#5A5A5E;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;cursor:pointer;}",
        ".fh-signout:hover{color:#1A1A1A;border-color:#36B3AF;}",
        ".fh-burger{display:none;align-items:center;justify-content:center;width:44px;height:40px;border:1px solid #E2E2E4;border-radius:6px;background:#fff;color:#5A5A5E;font-size:20px;line-height:1;cursor:pointer;}",
        "@media (max-width:860px){",
        ".fh-bar{flex-wrap:wrap;padding:14px 20px;}",
        ".fh-burger{display:inline-flex;margin-left:auto;}",
        ".fh-nav,.fh-right{display:none;width:100%;flex-direction:column;align-items:stretch;gap:6px;margin-top:10px;}",
        ".fh-bar.fh-open .fh-nav,.fh-bar.fh-open .fh-right{display:flex;}",
        ".fh-nav a{width:100%;}",
        ".fh-chip{align-self:flex-start;}",
        "}"
    ].join('');

    async function signOut() {
        try {
            var mod = await import('/system/fratello-auth.js');
            if (mod.firebaseConfigured && mod.firebaseConfigured()) await mod.signOutHub();
        } catch (error) {
            // fall back to local cleanup
        }
        ['fratello-role', 'fratello-session', 'fratello_session', 'fratello_tone'].forEach(function (key) {
            try { localStorage.removeItem(key); } catch (error) {}
        });
        window.location.href = '/index.html';
    }

    function render() {
        if (document.querySelector('.fh-bar')) return;

        var role = readRole();
        var isOwner = role && (role.key === 'owner' || String(role.label || '').toLowerCase() === 'owner');
        var user = (role && role.user) || {};
        var name = user.name || user.email || '';
        var first = name ? (name.split(' ')[0] || name) : '';

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var bar = document.createElement('header');
        bar.className = 'fh-bar';
        bar.innerHTML =
            '<a href="/index.html" aria-label="Fratello Hub"><img class="fh-logo" src="/assets/Fratello_Logo_Black.png" alt="Fratello"></a>' +
            '<button class="fh-burger" type="button" aria-label="Open menu" aria-expanded="false">☰</button>' +
            '<nav class="fh-nav" aria-label="Hub navigation">' +
                '<a href="/index.html#dashboard">Dashboard</a>' +
                '<a href="/index.html#departments">Departments</a>' +
                '<a href="/index.html#resources">Resources</a>' +
                (isOwner ? '<a href="/index.html#owner-admin">Owner Hub</a>' : '') +
                (isOwner ? '<a href="/index.html#settings">Settings</a>' : '') +
            '</nav>' +
            '<div class="fh-right">' +
                (name
                    ? '<div class="fh-chip"><span class="fh-avatar">' + escapeHtml(initials(name)) + '</span><span class="fh-copy"><span class="fh-name">' + escapeHtml(first) + '</span><span class="fh-access">' + escapeHtml(String(role.label || 'Staff') + ' access') + '</span></span></div>'
                    : '') +
                '<button class="fh-signout" type="button">Sign out</button>' +
            '</div>';

        var mount = document.getElementById('fratello-hub-header');
        if (mount) { mount.replaceWith(bar); }
        else { document.body.insertBefore(bar, document.body.firstChild); }

        var burger = bar.querySelector('.fh-burger');
        burger.addEventListener('click', function () {
            var open = bar.classList.toggle('fh-open');
            burger.setAttribute('aria-expanded', String(open));
        });
        bar.querySelector('.fh-signout').addEventListener('click', signOut);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();

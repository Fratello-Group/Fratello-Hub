// Shared Fratello Hub header.
//
// Drop this onto any page to get the standard header (logo, nav, account
// dropdown, mobile hamburger). It uses absolute paths so it works at any
// folder depth. Usage on a page:
//   <div id="fratello-hub-header"></div>
//   <script src="/system/hub-header.js"></script>
// If the placeholder div is omitted, the header is prepended to <body>.
(function () {
    var ROLE_KEY = 'fratello-role';
    var styled = false;
    var outsideBound = false;

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
        ".fh-bar{position:sticky;top:0;z-index:500;display:flex;align-items:center;gap:18px;padding:14px 28px;background:rgba(255,255,255,.97);border-bottom:1px solid #E2E2E4;box-shadow:0 1px 2px rgba(15,17,17,.04);font-family:'Montserrat',sans-serif;box-sizing:border-box;}",
        ".fh-logo{height:30px;width:auto;display:block;}",
        ".fh-nav{display:flex;align-items:center;gap:2px;margin-right:auto;flex-wrap:wrap;}",
        ".fh-nav a{min-height:42px;display:inline-flex;align-items:center;padding:8px 14px;border-bottom:2px solid transparent;color:#5A5A5E;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;white-space:nowrap;}",
        ".fh-nav a:hover{color:#1A1A1A;border-bottom-color:#36B3AF;}",
        ".fh-right{display:flex;align-items:center;gap:12px;}",
        ".fh-account{position:relative;}",
        ".fh-chip{display:inline-flex;align-items:center;gap:9px;padding:5px 10px 5px 5px;border:1px solid #E2E2E4;border-radius:6px;background:#fff;cursor:pointer;font:inherit;}",
        ".fh-avatar{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:3px;background:rgba(54,179,175,.12);border:1px solid rgba(54,179,175,.5);color:#1f7a76;font-size:11px;font-weight:800;letter-spacing:1px;}",
        ".fh-copy{display:flex;flex-direction:column;line-height:1.15;text-align:left;}",
        ".fh-name{font-size:12px;font-weight:800;color:#1A1A1A;}",
        ".fh-access{font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#1f7a76;}",
        ".fh-caret{font-size:9px;color:#8a8a8a;margin-left:1px;}",
        ".fh-menu{position:absolute;top:calc(100% + 6px);right:0;min-width:248px;background:#fff;border:1px solid #E2E2E4;box-shadow:0 14px 34px rgba(0,0,0,.14);z-index:60;}",
        ".fh-menu[hidden]{display:none;}",
        ".fh-menu-head{padding:14px 16px;border-bottom:1px solid #E2E2E4;}",
        ".fh-menu-name{display:block;font-size:14px;font-weight:800;color:#1A1A1A;}",
        ".fh-menu-email{display:block;font-size:12px;color:#5A5A5E;margin-top:2px;word-break:break-all;}",
        ".fh-menu-rows{padding:8px 16px;border-bottom:1px solid #E2E2E4;}",
        ".fh-menu-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 0;}",
        ".fh-menu-row span{color:#5A5A5E;text-transform:uppercase;letter-spacing:1.2px;font-size:11px;font-weight:800;}",
        ".fh-menu-row strong{font-size:12px;color:#1A1A1A;font-weight:700;}",
        ".fh-menu-link,.fh-menu-signout{display:block;width:100%;text-align:left;padding:12px 16px;font-size:13px;font-weight:700;background:#fff;color:#1A1A1A;border:0;border-top:1px solid #E2E2E4;cursor:pointer;text-decoration:none;}",
        ".fh-menu-link:hover,.fh-menu-signout:hover{background:rgba(54,179,175,.1);}",
        ".fh-menu-signout{color:#b3261e;}",
        ".fh-burger{display:none;align-items:center;justify-content:center;width:44px;height:40px;border:1px solid #E2E2E4;border-radius:6px;background:#fff;color:#5A5A5E;font-size:20px;line-height:1;cursor:pointer;}",
        "@media (max-width:860px){",
        ".fh-bar{flex-wrap:wrap;padding:14px 20px;}",
        ".fh-burger{display:inline-flex;margin-left:auto;}",
        ".fh-nav,.fh-right{display:none;width:100%;flex-direction:column;align-items:stretch;gap:6px;margin-top:10px;}",
        ".fh-bar.fh-open .fh-nav,.fh-bar.fh-open .fh-right{display:flex;}",
        ".fh-nav a{width:100%;}",
        ".fh-account{width:100%;}",
        ".fh-chip{width:100%;justify-content:flex-start;}",
        ".fh-menu{position:static;min-width:0;margin-top:8px;box-shadow:none;}",
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

    function buildBar(role) {
        var isOwner = role && (role.key === 'owner' || String(role.label || '').toLowerCase() === 'owner');
        var user = (role && role.user) || {};
        var name = user.name || user.email || '';
        var first = name ? (name.split(' ')[0] || name) : '';
        var email = user.email || '';
        var accessLabel = role ? String(role.label || 'Staff') : '';

        var account = name
            ? '<div class="fh-account">' +
                  '<button class="fh-chip" type="button" aria-haspopup="true" aria-expanded="false">' +
                      '<span class="fh-avatar">' + escapeHtml(initials(name)) + '</span>' +
                      '<span class="fh-copy"><span class="fh-name">' + escapeHtml(first) + '</span><span class="fh-access">' + escapeHtml(accessLabel + ' access') + '</span></span>' +
                      '<span class="fh-caret">▾</span>' +
                  '</button>' +
                  '<div class="fh-menu" hidden>' +
                      '<div class="fh-menu-head"><span class="fh-menu-name">' + escapeHtml(name) + '</span><span class="fh-menu-email">' + escapeHtml(email) + '</span></div>' +
                      '<div class="fh-menu-rows"><div class="fh-menu-row"><span>Access</span><strong>' + escapeHtml(accessLabel) + '</strong></div></div>' +
                      (isOwner ? '<a class="fh-menu-link" href="/system/permissions.html">Manage people</a>' : '') +
                      '<button class="fh-menu-signout" type="button">Sign out</button>' +
                  '</div>' +
              '</div>'
            : '<button class="fh-menu-signout" type="button" style="border:1px solid #E2E2E4;border-radius:6px;">Sign out</button>';

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
            '<div class="fh-right">' + account + '</div>';
        return bar;
    }

    function wire(bar) {
        function publishHeight() {
            try { document.documentElement.style.setProperty('--fh-bar-h', bar.offsetHeight + 'px'); } catch (error) {}
        }
        publishHeight();
        window.addEventListener('resize', publishHeight);

        var burger = bar.querySelector('.fh-burger');
        if (burger) burger.addEventListener('click', function () {
            var open = bar.classList.toggle('fh-open');
            burger.setAttribute('aria-expanded', String(open));
            publishHeight();
        });

        var chip = bar.querySelector('.fh-chip');
        var menu = bar.querySelector('.fh-menu');
        if (chip && menu) {
            chip.addEventListener('click', function (event) {
                event.stopPropagation();
                var open = menu.hidden;
                menu.hidden = !open;
                chip.setAttribute('aria-expanded', String(open));
            });
        }

        var signoutBtn = bar.querySelector('.fh-menu-signout');
        if (signoutBtn) signoutBtn.addEventListener('click', signOut);
    }

    function bindOutside() {
        if (outsideBound) return;
        outsideBound = true;
        document.addEventListener('click', function (event) {
            if (event.target.closest('.fh-account')) return;
            var menu = document.querySelector('.fh-menu');
            var chip = document.querySelector('.fh-chip');
            if (menu && !menu.hidden) {
                menu.hidden = true;
                if (chip) chip.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function mount(role) {
        if (!styled) {
            var style = document.createElement('style');
            style.textContent = CSS;
            document.head.appendChild(style);
            styled = true;
        }
        var bar = buildBar(role);
        var existing = document.querySelector('.fh-bar');
        if (existing) {
            existing.replaceWith(bar);
        } else {
            var slot = document.getElementById('fratello-hub-header');
            if (slot) { slot.replaceWith(bar); }
            else { document.body.insertBefore(bar, document.body.firstChild); }
        }
        wire(bar);
        bindOutside();
    }

    function hasName(role) {
        return Boolean(role && role.user && (role.user.name || role.user.email));
    }

    function start() {
        mount(readRole());
        // The login can resolve after this script runs (Firebase auth is async).
        // Fill the chip in once the role lands, then stop checking.
        if (hasName(readRole())) return;
        var tries = 0;
        var timer = setInterval(function () {
            tries += 1;
            var role = readRole();
            if (hasName(role)) {
                mount(role);
                clearInterval(timer);
            } else if (tries >= 8) {
                clearInterval(timer);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

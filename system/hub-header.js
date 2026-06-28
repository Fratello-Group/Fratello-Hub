// Shared Fratello Hub header.
//
// Drop this onto any page to get the standard header (logo, account dropdown,
// and a hamburger menu for navigation). It uses absolute paths so it works at
// any folder depth. Usage on a page:
//   <div id="fratello-hub-header"></div>
//   <script src="/system/hub-header.js"></script>
// If the placeholder div is omitted, the header is prepended to <body>.
(function () {
    var ROLE_KEY = 'fratello-role';
    var VIEW_AS_KEY = 'fratello-view-as';
    var styled = false;
    var outsideBound = false;

    function readRole() {
        try { return JSON.parse(localStorage.getItem(ROLE_KEY) || 'null'); }
        catch (error) { return null; }
    }

    function readViewAs() {
        try { return JSON.parse(localStorage.getItem(VIEW_AS_KEY) || 'null'); }
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
        ".fh-bar{position:sticky;top:0;z-index:500;display:flex;align-items:center;gap:18px;padding:13px 28px;background:rgba(255,255,255,.97);border-bottom:1px solid #ECEEEC;box-shadow:0 1px 2px rgba(15,17,17,.04);font-family:'Inter',-apple-system,'Segoe UI',sans-serif;box-sizing:border-box;}",
        ".fh-viewas{position:sticky;top:0;z-index:600;display:flex;align-items:center;gap:12px;min-height:40px;box-sizing:border-box;padding:9px 22px;background:linear-gradient(90deg,#1E7E77,#2FA9A0);color:#fff;font-family:'Inter',-apple-system,'Segoe UI',sans-serif;font-size:13px;font-weight:600;}",
        ".fh-viewas .vatext{flex:1;}",
        ".fh-viewas strong{font-weight:800;}",
        ".fh-viewas .vaexit{border:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.18);color:#fff;font-family:inherit;font-weight:800;font-size:12px;padding:6px 15px;border-radius:999px;cursor:pointer;white-space:nowrap;}",
        ".fh-viewas .vaexit:hover{background:rgba(255,255,255,.3);}",
        "body.fh-view-as .fh-bar{top:40px;}",
        ".fh-logo-link{flex:0 0 auto;display:block;}",
        ".fh-logo{height:30px;width:auto;display:block;}",
        // Primary nav: a dropdown under the bar on mobile, a pill track on desktop
        ".fh-nav{position:absolute;top:100%;left:0;right:0;display:none;flex-direction:column;gap:2px;padding:8px 14px;background:#fff;border-bottom:1px solid #ECEEEC;box-shadow:0 14px 34px rgba(0,0,0,.12);z-index:480;}",
        ".fh-bar.fh-nav-open .fh-nav{display:flex;}",
        ".fh-nav-btn{display:block;text-align:left;padding:12px 14px;border:0;border-radius:10px;background:transparent;color:#16262E;font:inherit;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;cursor:pointer;}",
        ".fh-nav-btn:hover{background:rgba(47,169,160,.10);color:#1E7E77;}",
        ".fh-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex:0 0 auto;}",
        ".fh-account{position:relative;}",
        ".fh-chip{display:inline-flex;align-items:center;gap:9px;padding:5px 12px 5px 5px;border:1px solid #ECEEEC;border-radius:999px;background:#fff;cursor:pointer;font:inherit;}",
        ".fh-avatar{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#E8F4F2;color:#1E7E77;font-size:11px;font-weight:700;letter-spacing:.5px;}",
        ".fh-copy{display:flex;flex-direction:column;line-height:1.15;text-align:left;}",
        ".fh-name{font-size:12.5px;font-weight:700;color:#16262E;}",
        ".fh-access{font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1E7E77;}",
        ".fh-caret{font-size:9px;color:#8a8a8a;margin-left:1px;}",
        ".fh-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:248px;background:#fff;border:1px solid #ECEEEC;border-radius:14px;box-shadow:0 14px 34px rgba(0,0,0,.14);z-index:600;overflow:hidden;}",
        ".fh-menu[hidden]{display:none;}",
        ".fh-menu-head{padding:14px 16px;border-bottom:1px solid #ECEEEC;}",
        ".fh-menu-name{display:block;font-size:14px;font-weight:700;color:#16262E;}",
        ".fh-menu-email{display:block;font-size:12px;color:#5A5A5E;margin-top:2px;word-break:break-all;}",
        ".fh-menu-rows{padding:8px 16px;border-bottom:1px solid #ECEEEC;}",
        ".fh-menu-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 0;}",
        ".fh-menu-row span{color:#5A5A5E;text-transform:uppercase;letter-spacing:1.2px;font-size:11px;font-weight:700;}",
        ".fh-menu-row strong{font-size:12px;color:#16262E;font-weight:700;}",
        ".fh-menu-link,.fh-menu-signout{display:block;width:100%;text-align:left;padding:12px 16px;font-size:13px;font-weight:600;background:#fff;color:#16262E;border:0;border-top:1px solid #ECEEEC;cursor:pointer;text-decoration:none;}",
        ".fh-menu-link:hover,.fh-menu-signout:hover{background:rgba(47,169,160,.1);}",
        ".fh-menu-signout{color:#b3261e;}",
        ".fh-burger{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 15px;border:1px solid #2FA9A0;border-radius:999px;background:#E8F4F2;color:#1E7E77;font:inherit;font-weight:600;font-size:13px;letter-spacing:.3px;cursor:pointer;}",
        ".fh-burger:hover{background:#d9ece9;}",
        ".fh-burger svg{display:block;flex:none;}",
        // Desktop: inline pill nav, hamburger hidden
        "@media (min-width:860px){",
        ".fh-burger{display:none;}",
        ".fh-nav{position:static;display:inline-flex;flex-direction:row;gap:4px;width:auto;padding:5px;background:#EDEFEE;border:0;border-radius:999px;box-shadow:none;}",
        ".fh-nav-btn{border-radius:999px;padding:9px 17px;color:#8B949B;}",
        ".fh-nav-btn:hover{background:transparent;color:#16262E;}",
        ".fh-nav-btn.active{background:#fff;color:#16262E;box-shadow:0 1px 2px rgba(16,38,46,.10);}",
        "}",
        // Back + breadcrumb subnav (appears on every page that loads this header)
        ".fh-subnav{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:11px 28px;background:#fff;border-bottom:1px solid #ECEEEC;box-sizing:border-box;font-family:'Inter',-apple-system,'Segoe UI',sans-serif;}",
        ".fh-back{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 15px;border:1px solid #ECEEEC;border-radius:999px;background:#fff;color:#16262E;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;flex:0 0 auto;}",
        ".fh-back:hover{border-color:#2FA9A0;color:#1E7E77;}",
        ".fh-back svg{display:block;}",
        ".fh-crumbs{display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12.5px;color:#8B949B;min-width:0;}",
        ".fh-crumbs a{color:#1E7E77;text-decoration:none;font-weight:600;}",
        ".fh-crumbs a:hover{text-decoration:underline;}",
        ".fh-crumb-sep{color:#C4C3C0;font-weight:600;}",
        ".fh-crumb-current{color:#4A4A4A;font-weight:600;}",
        ".fh-subnav-actions{margin-left:auto;display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;}",
        ".fh-subnav-actions .btn{height:34px;padding:0 16px;display:inline-flex;align-items:center;border-radius:999px;font-size:13px;font-weight:700;margin:0;}",
        "@media (max-width:560px){",
        ".fh-bar{padding:12px 14px;gap:10px;}",
        ".fh-logo{height:26px;}",
        ".fh-copy .fh-access{display:none;}",
        ".fh-burger-text{display:none;}",
        ".fh-burger{padding:0;width:40px;justify-content:center;}",
        ".fh-subnav{padding:9px 16px;gap:10px;}",
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

        // The same primary nav as the Hub: a pill track on desktop, a dropdown
        // behind the hamburger on mobile. Links jump back into the Hub views.
        var nav =
            '<nav class="fh-nav" aria-label="Hub">' +
                '<a class="fh-nav-btn" href="/index.html">Dashboard</a>' +
                '<a class="fh-nav-btn" href="/index.html#departments">Departments</a>' +
                (isOwner ? '<a class="fh-nav-btn" href="/index.html#owner-admin">Owner Hub</a>' : '') +
                (isOwner ? '<a class="fh-nav-btn" href="/index.html#settings">Settings</a>' : '') +
            '</nav>';

        var burger =
            '<button class="fh-burger" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Open navigation menu">' +
                '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
                '<span class="fh-burger-text">Menu</span>' +
            '</button>';

        var bar = document.createElement('header');
        bar.className = 'fh-bar';
        bar.innerHTML =
            '<a class="fh-logo-link" href="/index.html" aria-label="Fratello Hub"><img class="fh-logo" src="/assets/Fratello_Logo_Black.png" alt="Fratello"></a>' +
            nav +
            '<div class="fh-right">' + account + burger + '</div>';
        return bar;
    }

    function pageTitleLabel() {
        var t = (document.title || '').trim();
        t = t.replace(/^Fratello\s*(Ops\s+)?(Hub\s*)?[-–—|:]\s*/i, '');
        return t || 'This page';
    }

    // A slim row under the header: a Back button + breadcrumbs, on every page.
    // If the page already ships its own breadcrumb (e.g. the CFIA module), we
    // relocate that live node into the subnav so dynamic labels keep updating.
    function buildSubnav() {
        var sub = document.createElement('nav');
        sub.className = 'fh-subnav';
        sub.setAttribute('aria-label', 'Page navigation');

        var back = document.createElement('a');
        back.className = 'fh-back';
        back.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
            '<path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<span>Back</span>';

        var existing = document.querySelector('.crumbs, nav[aria-label="Breadcrumb"]');
        var backHref = '/index.html';
        var crumbs;
        if (existing) {
            crumbs = existing;                       // reuse the page's own trail
            crumbs.style.margin = '0';               // ships as a pill w/ margin-bottom; kill it so it sits inline with Back
            var links = existing.querySelectorAll('a[href]');
            if (links.length) backHref = links[links.length - 1].getAttribute('href');
        } else {
            crumbs = document.createElement('span');
            crumbs.className = 'fh-crumbs';
            crumbs.innerHTML =
                '<a href="/index.html">Hub</a>' +
                '<span class="fh-crumb-sep">›</span>' +
                '<span class="fh-crumb-current">' + escapeHtml(pageTitleLabel()) + '</span>';
        }
        back.setAttribute('href', backHref);

        sub.appendChild(back);
        sub.appendChild(crumbs);
        return sub;
    }

    // The CFIA pages ship their own title bar (.cfia-bar) that now just duplicates
    // the unified header + page hero. Lift its primary action (Food Safety
    // Dashboard) into the Back/breadcrumb row and drop the redundant bar — saves
    // a whole row and keeps the action on the persistent nav line.
    function liftCfiaActions(sub) {
        var cbar = document.querySelector('.cfia-bar');
        if (!cbar) return;
        var actions = cbar.querySelector('.actions');
        if (actions && !actions.classList.contains('fh-subnav-actions')) {
            actions.classList.add('fh-subnav-actions');
            sub.appendChild(actions);                  // move the live button(s), links intact
        }
        cbar.style.display = 'none';
    }

    function mountSubnav(bar) {
        var sub = document.querySelector('.fh-subnav');
        if (!sub) sub = buildSubnav();
        bar.insertAdjacentElement('afterend', sub);   // keep it directly under the bar
        liftCfiaActions(sub);
    }

    function wire(bar) {
        function publishHeight() {
            try { document.documentElement.style.setProperty('--fh-bar-h', bar.offsetHeight + 'px'); } catch (error) {}
        }
        publishHeight();
        window.addEventListener('resize', publishHeight);

        var burger = bar.querySelector('.fh-burger');
        var nav = bar.querySelector('.fh-nav');
        var chip = bar.querySelector('.fh-chip');
        var menu = bar.querySelector('.fh-menu');

        function closeAccount() {
            if (menu && !menu.hidden) { menu.hidden = true; if (chip) chip.setAttribute('aria-expanded', 'false'); }
        }
        function closeNav() {
            if (bar.classList.contains('fh-nav-open')) { bar.classList.remove('fh-nav-open'); if (burger) burger.setAttribute('aria-expanded', 'false'); }
        }

        if (burger && nav) {
            burger.addEventListener('click', function (event) {
                event.stopPropagation();
                var open = !bar.classList.contains('fh-nav-open');
                closeAccount();
                bar.classList.toggle('fh-nav-open', open);
                burger.setAttribute('aria-expanded', String(open));
            });
            // Picking a destination on mobile closes the dropdown.
            nav.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', closeNav); });
        }

        if (chip && menu) {
            chip.addEventListener('click', function (event) {
                event.stopPropagation();
                var open = menu.hidden;
                closeNav();
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
            var bar = document.querySelector('.fh-bar');
            if (!bar) return;
            if (!event.target.closest('.fh-account')) {
                var menu = bar.querySelector('.fh-menu');
                var chip = bar.querySelector('.fh-chip');
                if (menu && !menu.hidden) { menu.hidden = true; if (chip) chip.setAttribute('aria-expanded', 'false'); }
            }
            if (!event.target.closest('.fh-burger') && !event.target.closest('.fh-nav')) {
                if (bar.classList.contains('fh-nav-open')) {
                    bar.classList.remove('fh-nav-open');
                    var burger = bar.querySelector('.fh-burger');
                    if (burger) burger.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }

    // While the Owner is previewing the Hub "as" another role, show a slim banner
    // on every sub-page too, with a one-tap way back to their own view.
    function exitViewAsPage() {
        var real = readViewAs();
        try { localStorage.removeItem(VIEW_AS_KEY); } catch (e) {}
        if (real) { try { localStorage.setItem(ROLE_KEY, JSON.stringify(real)); } catch (e) {} }
        window.location.reload();
    }

    function mountViewAsBanner() {
        var existing = document.querySelector('.fh-viewas');
        if (!readViewAs()) {
            if (existing) existing.remove();
            document.body.classList.remove('fh-view-as');
            return;
        }
        var persona = readRole();
        var label = (persona && persona.label) ? persona.label : 'a teammate';
        var who = (persona && persona.user && persona.user.firstName) ? persona.user.firstName + ' · ' : '';
        if (!existing) {
            existing = document.createElement('div');
            existing.className = 'fh-viewas';
            document.body.insertBefore(existing, document.body.firstChild);
        }
        existing.innerHTML = '<span aria-hidden="true">👁</span>' +
            '<span class="vatext">Previewing as <strong>' + escapeHtml(who + label) + '</strong> — only you can see this</span>' +
            '<button type="button" class="vaexit">Back to my view</button>';
        existing.querySelector('.vaexit').addEventListener('click', exitViewAsPage);
        document.body.classList.add('fh-view-as');
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
        mountSubnav(bar);
        wire(bar);
        bindOutside();
        mountViewAsBanner();
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

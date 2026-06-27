// Shared auth-gate for Hub "embed" pages (branded iframe wrappers).
//
// Toggles the page between three states by setting body classes that
// system/embed.css styles: `auth-checking` (initial), `denied` (no access),
// or neither (allowed). Mirrors the original per-page inline guard, now in one
// place so new embed pages stay tiny.
//
// Usage in a page:
//   <script type="module">
//     import { guardEmbed } from '/system/embed-guard.js';
//     guardEmbed(['owner', 'controller', 'sales']);
//   </script>
import { firebaseConfigured, onHubAuthChange } from '/system/fratello-auth.js';

export function guardEmbed(allowedRoles) {
    const allowed = new Set(allowedRoles);

    function denyAccess() {
        document.body.classList.remove('auth-checking');
        document.body.classList.add('denied');
    }

    function allowAccess() {
        document.body.classList.remove('auth-checking', 'denied');
    }

    function roleFromLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem('fratello-role') || 'null');
        } catch (error) {
            return null;
        }
    }

    if (firebaseConfigured()) {
        onHubAuthChange(role => {
            if (role && allowed.has(role.key)) allowAccess();
            else denyAccess();
        });
    } else {
        const role = roleFromLocalStorage();
        if (role && allowed.has(role.key)) allowAccess();
        else denyAccess();
    }
}

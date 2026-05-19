#!/usr/bin/env python3
"""
Fratello Hub security smoke test.

This is a Fratello-specific, mostly read-only check for the current Hub setup:
- Netlify/browser security headers
- Firebase/Firestore public access rules
- Hub protected-page guards
- Netlify function auth rejection
- Optional Firebase public signup check, with cleanup

It produces a JSON file and a simple HTML report. It uses only Python's standard
library so it can run on a normal Mac without installing packages.
"""

from __future__ import annotations

import argparse
import html
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_URL = "https://fratello-ops-hub.netlify.app"
DEFAULT_FIREBASE_API_KEY = "AIzaSyDBZSpwGy2MifMmoKzIz_HYbVEceo2qK7Q"
DEFAULT_FIREBASE_PROJECT = "fratello-hub"

FIRESTORE_COLLECTIONS = [
    "hubProfiles",
    "hubInvites",
]

PROTECTED_PAGES = [
    {
        "path": "/system/permissions.html",
        "name": "Staff Permissions",
        "must_contain": ["onHubAuthChange", "requireOwner", "owner"],
    },
    {
        "path": "/hr/hiring/hiring-document-generator.html",
        "name": "Hiring Document Generator",
        "must_contain": ["onHubAuthChange", "const allowed", "owner", "controller"],
    },
    {
        "path": "/sales/proposal-builder.html",
        "name": "Wholesale Proposal Builder",
        "must_contain": ["body class=\"denied\"", "onHubAuthChange", "sales"],
    },
    {
        "path": "/system/skills/fratello-design-skill.html",
        "name": "Fratello Design Skill",
        "must_contain": ["body class=\"denied\"", "onHubAuthChange"],
    },
]

NETLIFY_FUNCTION_CHECKS = [
    {
        "path": "/.netlify/functions/auth",
        "method": "POST",
        "payload": {"action": "users:list"},
        "expected": {401, 403},
        "name": "Auth function rejects unauthenticated staff list request",
    },
    {
        "path": "/.netlify/functions/auth",
        "method": "POST",
        "payload": {"action": "users:invite", "email": "test@example.com"},
        "expected": {401, 403},
        "name": "Auth function rejects unauthenticated invite request",
    },
]


@dataclass
class Result:
    test_id: str
    name: str
    severity: str
    status: str
    details: str
    recommendation: str = ""


def request(
    url: str,
    method: str = "GET",
    data: Any | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> tuple[int, str, dict[str, str]]:
    body = None
    req_headers = headers.copy() if headers else {}
    if data is not None:
        body = json.dumps(data).encode("utf-8") if isinstance(data, (dict, list)) else str(data).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return resp.status, text, {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        return error.code, text, {k.lower(): v for k, v in error.headers.items()}
    except Exception as error:
        return 0, str(error), {}


def target_join(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + "/" + path.lstrip("/")


def firestore_url(project: str, collection: str) -> str:
    safe_collection = urllib.parse.quote(collection, safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{safe_collection}"


def pass_fail(condition: bool) -> str:
    return "PASS" if condition else "FAIL"


def test_site_reachable(base_url: str) -> Result:
    status, _, headers = request(base_url)
    ok = 200 <= status < 400
    https = base_url.startswith("https://")
    return Result(
        "FH-001",
        "Hub is reachable over HTTPS",
        "High",
        "ERROR" if status == 0 else pass_fail(ok and https),
        f"HTTP status {status}. HTTPS URL: {'yes' if https else 'no'}.",
        "Use only the HTTPS Netlify URL or a custom HTTPS domain." if not https else "",
    )


def test_security_headers(base_url: str) -> list[Result]:
    status, _, headers = request(base_url)
    checks = [
        (
            "FH-002",
            "Content Security Policy is present",
            "Medium",
            "content-security-policy" in headers,
            "Add a CSP header to reduce script injection risk.",
        ),
        (
            "FH-003",
            "Clickjacking protection is present",
            "Medium",
            "x-frame-options" in headers or "frame-ancestors" in headers.get("content-security-policy", ""),
            "Add X-Frame-Options or CSP frame-ancestors. If embedding tools is needed, allow only trusted domains.",
        ),
        (
            "FH-004",
            "Strict Transport Security is strong",
            "Medium",
            "strict-transport-security" in headers and "max-age=31536000" in headers.get("strict-transport-security", ""),
            "Keep HSTS enabled with at least one year max-age.",
        ),
        (
            "FH-005",
            "Content type sniffing is disabled",
            "Low",
            headers.get("x-content-type-options", "").lower() == "nosniff",
            "Add X-Content-Type-Options: nosniff.",
        ),
        (
            "FH-006",
            "Referrer policy is present",
            "Low",
            "referrer-policy" in headers,
            "Add Referrer-Policy, such as strict-origin-when-cross-origin.",
        ),
        (
            "FH-007",
            "Permissions policy is present",
            "Low",
            "permissions-policy" in headers,
            "Add Permissions-Policy to disable unused browser features like camera and microphone.",
        ),
    ]

    results = []
    for test_id, name, severity, ok, recommendation in checks:
        results.append(Result(
            test_id,
            name,
            severity,
            "ERROR" if status == 0 else pass_fail(ok),
            f"Home page returned HTTP {status}. Header check: {'found' if ok else 'missing or weak'}.",
            "" if ok else recommendation,
        ))
    return results


def test_firestore_public_access(project: str) -> list[Result]:
    results = []
    for index, collection in enumerate(FIRESTORE_COLLECTIONS, start=1):
        status, body, _ = request(f"{firestore_url(project, collection)}?pageSize=1")
        ok = status == 403
        results.append(Result(
            f"FH-1{index:02d}",
            f"Firestore {collection} is not publicly readable",
            "Critical",
            "ERROR" if status == 0 else pass_fail(ok),
            f"Unauthenticated GET returned HTTP {status}.",
            "" if ok else f"Update Firestore rules so unauthenticated users cannot read {collection}. Response: {body[:250]}",
        ))

        write_status, write_body, _ = request(
            firestore_url(project, collection),
            method="POST",
            data={"fields": {"_pentest": {"booleanValue": True}}},
        )
        write_ok = write_status == 403
        results.append(Result(
            f"FH-2{index:02d}",
            f"Firestore {collection} is not publicly writable",
            "Critical",
            "ERROR" if write_status == 0 else pass_fail(write_ok),
            f"Unauthenticated POST returned HTTP {write_status}.",
            "" if write_ok else f"Update Firestore rules so unauthenticated users cannot write {collection}. Response: {write_body[:250]}",
        ))
    return results


def test_protected_pages(base_url: str) -> list[Result]:
    results = []
    for index, page in enumerate(PROTECTED_PAGES, start=1):
        status, body, _ = request(target_join(base_url, page["path"]))
        found = all(marker in body for marker in page["must_contain"])
        results.append(Result(
            f"FH-3{index:02d}",
            f"{page['name']} has a Hub access guard",
            "High",
            "ERROR" if status == 0 else pass_fail(status == 200 and found),
            f"HTTP {status}. Required guard markers: {', '.join(page['must_contain'])}.",
            "" if found else "Add a default-deny screen and Firebase role check before showing this page.",
        ))
    return results


def test_netlify_functions(base_url: str) -> list[Result]:
    results = []
    for index, check in enumerate(NETLIFY_FUNCTION_CHECKS, start=1):
        status, body, _ = request(
            target_join(base_url, check["path"]),
            method=check["method"],
            data=check["payload"],
        )
        ok = status in check["expected"]
        results.append(Result(
            f"FH-4{index:02d}",
            check["name"],
            "High",
            "ERROR" if status == 0 else pass_fail(ok),
            f"Unauthenticated request returned HTTP {status}.",
            "" if ok else f"Make the Netlify function reject this action without owner authentication. Response: {body[:250]}",
        ))
    return results


def test_firebase_signup(api_key: str, active: bool) -> Result:
    if not active:
        return Result(
            "FH-501",
            "Firebase public email signup check",
            "Medium",
            "SKIP",
            "Skipped by default because it creates and deletes a temporary Firebase account.",
            "Run again with --active-signup-check when you want to test whether public signup is open.",
        )

    email = f"fratello-security-smoke-{int(time.time())}@example.com"
    password = "TempSecurityCheck2026!!"
    status, body, _ = request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={urllib.parse.quote(api_key)}",
        method="POST",
        data={"email": email, "password": password, "returnSecureToken": True},
    )
    parsed = {}
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        pass

    if status == 200 and parsed.get("idToken"):
        delete_status, _, _ = request(
            f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={urllib.parse.quote(api_key)}",
            method="POST",
            data={"idToken": parsed["idToken"]},
        )
        return Result(
            "FH-501",
            "Firebase public email signup check",
            "Medium",
            "FAIL",
            f"Public signup created a temporary account, then cleanup returned HTTP {delete_status}.",
            "For a tighter invite-only Hub, disable public email/password signup or enforce invite-only account creation server-side.",
        )

    error_message = parsed.get("error", {}).get("message", body[:250])
    if status == 0:
        return Result(
            "FH-501",
            "Firebase public email signup check",
            "Medium",
            "ERROR",
            f"Could not connect to Firebase Auth: {error_message}",
            "Re-run the test when network access is available.",
        )

    ok = status == 400 and "OPERATION_NOT_ALLOWED" in error_message
    return Result(
        "FH-501",
        "Firebase public email signup check",
        "Medium",
        pass_fail(ok),
        f"Signup attempt returned HTTP {status}: {error_message}",
        "" if ok else "Confirm this result in Firebase Authentication settings.",
    )


def test_firebase_config(base_url: str) -> list[Result]:
    status, body, _ = request(target_join(base_url, "/system/firebase-config.js"))
    results = []
    config_loaded = status == 200 and "FRATELLO_FIREBASE_CONFIG" in body and "enabled: true" in body
    results.append(Result(
        "FH-601",
        "Firebase config is live",
        "High",
        pass_fail(config_loaded),
        f"Config file returned HTTP {status}. Firebase enabled marker: {'yes' if 'enabled: true' in body else 'no'}.",
        "The Hub should use Firebase Auth rather than the older temporary login path." if not config_loaded else "",
    ))

    legacy_setup_visible = "fratello-owner-setup" in body
    results.append(Result(
        "FH-602",
        "Legacy owner setup code is not exposed in Firebase config",
        "High",
        pass_fail(not legacy_setup_visible),
        "Checked firebase-config.js for the old temporary setup code.",
        "Remove any hard-coded setup codes from public files." if legacy_setup_visible else "",
    ))
    return results


def severity_weight(result: Result) -> int:
    if result.status != "FAIL":
        return 0
    return {"Critical": 30, "High": 18, "Medium": 10, "Low": 5}.get(result.severity, 5)


def write_json_report(path: Path, meta: dict[str, Any], results: list[Result]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump({"meta": meta, "results": [asdict(item) for item in results]}, handle, indent=2)


def html_report(meta: dict[str, Any], results: list[Result]) -> str:
    failed = [item for item in results if item.status == "FAIL"]
    passed = [item for item in results if item.status == "PASS"]
    skipped = [item for item in results if item.status == "SKIP"]
    errors = [item for item in results if item.status == "ERROR"]
    score = max(0, 100 - sum(severity_weight(item) for item in results))

    def esc(value: Any) -> str:
        return html.escape(str(value), quote=True)

    rows = []
    status_order = {"FAIL": 0, "ERROR": 1, "PASS": 2, "SKIP": 3}
    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    for item in sorted(results, key=lambda r: (status_order.get(r.status, 9), severity_order.get(r.severity, 9), r.test_id)):
        rows.append(f"""
        <article class="finding {esc(item.status.lower())}">
            <div class="finding-head">
                <span class="test-id">{esc(item.test_id)}</span>
                <h2>{esc(item.name)}</h2>
                <span class="pill {esc(item.status.lower())}">{esc(item.status)}</span>
            </div>
            <div class="meta-line">{esc(item.severity)}</div>
            <p>{esc(item.details)}</p>
            {f'<div class="recommendation"><strong>Fix:</strong> {esc(item.recommendation)}</div>' if item.recommendation else ''}
        </article>
        """)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fratello Hub Security Report</title>
<style>
    :root {{
        --black: #1A1A1A;
        --cream: #F6F1E9;
        --teal: #36B3AF;
        --grey: #908F8A;
        --card: #232323;
        --line: #2E2E2E;
        --red: #D9533D;
        --gold: #C8973A;
        --green: #2F9D68;
    }}
    * {{ box-sizing: border-box; }}
    body {{
        margin: 0;
        background: var(--black);
        color: var(--cream);
        font-family: Montserrat, Helvetica, Arial, sans-serif;
        padding: 42px;
        line-height: 1.55;
    }}
    .wrap {{ max-width: 1120px; margin: 0 auto; }}
    .eyebrow {{ color: var(--teal); text-transform: uppercase; letter-spacing: 4px; font-size: 12px; font-weight: 800; }}
    h1 {{ font-size: clamp(38px, 6vw, 72px); line-height: 1.02; margin: 16px 0; }}
    .lede {{ color: #C4C3C0; max-width: 760px; }}
    .cards {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 38px 0; }}
    .card {{ background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--teal); padding: 18px; }}
    .num {{ font-size: 32px; font-weight: 800; }}
    .label {{ color: var(--grey); text-transform: uppercase; letter-spacing: 3px; font-size: 10px; font-weight: 800; }}
    .finding {{ background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--teal); padding: 18px; margin-bottom: 12px; }}
    .finding.fail {{ border-left-color: var(--red); }}
    .finding.error {{ border-left-color: var(--gold); }}
    .finding.skip {{ border-left-color: var(--grey); }}
    .finding-head {{ display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }}
    .finding h2 {{ font-size: 16px; margin: 0; flex: 1; }}
    .test-id {{ color: var(--grey); font-weight: 800; font-size: 12px; }}
    .pill {{ border: 1px solid var(--teal); color: var(--teal); border-radius: 3px; padding: 4px 8px; font-size: 10px; letter-spacing: 2px; font-weight: 800; }}
    .pill.fail {{ border-color: var(--red); color: var(--red); }}
    .pill.error {{ border-color: var(--gold); color: var(--gold); }}
    .pill.skip {{ border-color: var(--grey); color: var(--grey); }}
    .meta-line {{ color: var(--grey); text-transform: uppercase; letter-spacing: 3px; font-size: 10px; margin-top: 10px; }}
    .recommendation {{ margin-top: 12px; padding: 12px; background: rgba(54, 179, 175, 0.08); border: 1px solid rgba(54, 179, 175, 0.25); color: #C4C3C0; }}
    @media (max-width: 800px) {{
        body {{ padding: 24px; }}
        .cards {{ grid-template-columns: 1fr 1fr; }}
    }}
</style>
</head>
<body>
<main class="wrap">
    <div class="eyebrow">Fratello Hub Security Smoke Test</div>
    <h1>Security report.</h1>
    <p class="lede">Target: {esc(meta["target"])}<br>Run date: {esc(meta["timestamp"])}<br>This is a practical smoke test, not a full professional penetration test.</p>
    <section class="cards">
        <div class="card"><div class="num">{esc(score)}%</div><div class="label">Score</div></div>
        <div class="card"><div class="num">{len(results)}</div><div class="label">Tests</div></div>
        <div class="card"><div class="num">{len(passed)}</div><div class="label">Passed</div></div>
        <div class="card"><div class="num">{len(failed)}</div><div class="label">Failed</div></div>
        <div class="card"><div class="num">{len(errors) + len(skipped)}</div><div class="label">Skipped/Error</div></div>
    </section>
    {''.join(rows)}
</main>
</body>
</html>"""


def write_html_report(path: Path, meta: dict[str, Any], results: list[Result]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html_report(meta, results), encoding="utf-8")


def run(args: argparse.Namespace) -> tuple[dict[str, Any], list[Result]]:
    target = args.url.rstrip("/")
    results: list[Result] = []
    results.append(test_site_reachable(target))
    results.extend(test_security_headers(target))
    results.extend(test_firebase_config(target))
    results.extend(test_firestore_public_access(args.firebase_project))
    results.extend(test_protected_pages(target))
    results.extend(test_netlify_functions(target))
    results.append(test_firebase_signup(args.firebase_api_key, args.active_signup_check))

    meta = {
        "target": target,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "firebase_project": args.firebase_project,
        "active_signup_check": args.active_signup_check,
        "total": len(results),
        "passed": sum(1 for item in results if item.status == "PASS"),
        "failed": sum(1 for item in results if item.status == "FAIL"),
        "skipped": sum(1 for item in results if item.status == "SKIP"),
        "errors": sum(1 for item in results if item.status == "ERROR"),
    }
    return meta, results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Fratello Hub security smoke tests.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Hub URL to test. Default: {DEFAULT_URL}")
    parser.add_argument("--firebase-project", default=DEFAULT_FIREBASE_PROJECT, help="Firebase project id.")
    parser.add_argument("--firebase-api-key", default=DEFAULT_FIREBASE_API_KEY, help="Firebase web API key.")
    parser.add_argument("--active-signup-check", action="store_true", help="Create and delete a temporary account to test whether public signup is open.")
    parser.add_argument("--json-output", default="security/reports/fratello-security-results.json", help="JSON output path.")
    parser.add_argument("--html-output", default="security/reports/fratello-security-report.html", help="HTML report output path.")
    args = parser.parse_args()

    meta, results = run(args)
    write_json_report(Path(args.json_output), meta, results)
    write_html_report(Path(args.html_output), meta, results)

    print("Fratello Hub security smoke test complete")
    print(f"Target: {meta['target']}")
    print(f"Passed: {meta['passed']}  Failed: {meta['failed']}  Skipped: {meta['skipped']}  Errors: {meta['errors']}")
    print(f"JSON: {args.json_output}")
    print(f"HTML: {args.html_output}")

    return 1 if meta["failed"] or meta["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())

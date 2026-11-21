"""Add menu rules, or only owner refresh rules, without replacing live app rules.

Uses the currently signed-in gcloud account. No credentials are stored.
Default: compile and test. --apply additionally activates the tested ruleset.
"""

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import subprocess
import urllib.request

MENU_RULES = """
    // Public HS menus, written only by the scheduled server Admin SDK.
    match /cafeteriaMenus/{menuId} {
      allow read: if true;
      allow write: if false;
    }
    match /cafeteriaMenuSources/{sourceId} {
      allow read, write: if false;
    }
"""

# Which lunch menu students go for: a document a day, a map of uid to "A" or "B", and each
# signed-in student can change only their own entry (see src/menu/menuVotes.js).
VOTE_RULES = """
    // Lunch menu votes, one document a day: a student sets or clears only their own entry.
    match /cafeteriaVotes/{dayId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && dayId.matches('hs-[0-9]{4}-[0-9]{2}-[0-9]{2}')
        && request.resource.data.keys().hasOnly(['votes'])
        && request.resource.data.votes.keys().hasOnly([request.auth.uid])
        && request.resource.data.votes[request.auth.uid] in ['A', 'B'];
      allow update: if request.auth != null
        && request.resource.data.keys().hasOnly(['votes'])
        && request.resource.data.votes.diff(resource.data.votes).affectedKeys().hasOnly([request.auth.uid])
        && (!(request.auth.uid in request.resource.data.votes)
            || request.resource.data.votes[request.auth.uid] in ['A', 'B']);
      allow delete: if false;
    }
"""

REFRESH_RULES = """
    // Verified owners may request OCR; the Admin SDK worker owns all result/status fields.
    match /cafeteriaMenuRefresh/hs {
      allow get: if isAdmin() && request.auth.token.email_verified == true;
      allow list, delete: if false;
      allow create: if isAdmin() && request.auth.token.email_verified == true
        && request.resource.data.keys().hasOnly(['requestedAt'])
        && request.resource.data.requestedAt == request.time;
      allow update: if isAdmin() && request.auth.token.email_verified == true
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['requestedAt'])
        && request.resource.data.requestedAt == request.time
        && resource.data.requestedAt is timestamp
        && request.time >= resource.data.requestedAt + duration.value(2, 'm')
        && (('processedRequestAt' in resource.data
             && resource.data.processedRequestAt == resource.data.requestedAt)
            || request.time > resource.data.requestedAt + duration.value(35, 'm'));
    }
"""


def merge_refresh_rules(content):
    """Insert only the refresh block; never replace deployed menu/admin/vote rules."""
    matches = re.findall(r"match\s+/cafeteriaMenuRefresh(?:/|\b)", content)
    if matches:
        if len(matches) == 1 and content.count(REFRESH_RULES.strip()) == 1:
            return content
        raise ValueError("Live refresh rules already exist with different content; review before replacing")
    if not re.search(r"function\s+isAdmin\s*\(\s*\)", content):
        raise ValueError("Live rules must define the existing isAdmin() owner policy")
    anchor = "match /databases/{database}/documents {"
    if content.count(anchor) != 1:
        raise ValueError("Could not safely locate the Firestore document rules block")
    return content.replace(anchor, anchor + "\n" + REFRESH_RULES, 1)


def merge_vote_rules(content):
    """Adds the vote rules after the menu rules, leaving everything else as it is."""
    if "match /cafeteriaVotes/" in content:
        if VOTE_RULES.strip() in content:
            return content
        raise ValueError("Live vote rules already exist with different content; review before replacing")
    if content.count(MENU_RULES) != 1:
        raise ValueError("Could not safely locate the menu rules to add the vote rules after")
    return content.replace(MENU_RULES, MENU_RULES + VOTE_RULES, 1)


def merge_rules(content):
    if "match /cafeteriaMenus/" in content or "match /cafeteriaMenuSources/" in content:
        if MENU_RULES.strip() in content:
            return content
        raise ValueError("Live menu rules already exist with different content; review before replacing")
    anchor = "match /databases/{database}/documents {"
    if content.count(anchor) != 1:
        raise ValueError("Could not safely locate the Firestore document rules block")
    return content.replace(anchor, anchor + "\n" + MENU_RULES, 1)


def tests():
    cases = []
    for auth in (None, {"uid": "test-student", "token": {"email": "student@example.test"}},
                 {"uid": "test-admin", "token": {"email": "hajunk105@gmail.com"}}):
        for collection, read in (("cafeteriaMenus", "ALLOW"), ("cafeteriaMenuSources", "DENY")):
            for method in ("get", "list", "create", "update", "delete"):
                path = f"/databases/(default)/documents/{collection}/hs-2026-11-09"
                cases.append({
                    "expectation": read if method in {"get", "list"} else "DENY",
                    "request": {"path": path, "method": method, "auth": auth,
                                "resource": {"data": {"school": "HS"}}},
                    "resource": {"data": {"school": "HS"}},
                })
    return cases


def vote_tests():
    """Access-control cases for cafeteriaVotes: anonymous, a student and another student."""
    path = "/databases/(default)/documents/cafeteriaVotes/hs-2026-11-09"
    me = {"uid": "test-student", "token": {"email": "student@example.test"}}
    other = {"uid": "test-other", "token": {"email": "other@example.test"}}
    existing = {"data": {"votes": {"test-other": "B"}}}

    def case(expectation, method, auth, new=None, old=None):
        request = {"path": path, "method": method, "auth": auth}
        if new is not None:
            request["resource"] = {"data": new}
        result = {"expectation": expectation, "request": request}
        if old is not None:
            result["resource"] = old
        return result

    return [
        case("DENY", "get", None, old=existing),
        case("ALLOW", "get", me, old=existing),
        case("ALLOW", "list", me),
        case("DENY", "list", None),
        # Creating the day's document with only your own vote.
        case("ALLOW", "create", me, new={"votes": {"test-student": "A"}}),
        case("DENY", "create", None, new={"votes": {"test-student": "A"}}),
        case("DENY", "create", me, new={"votes": {"test-other": "A"}}),
        case("DENY", "create", me, new={"votes": {"test-student": "C"}}),
        case("DENY", "create", me, new={"votes": {"test-student": "A"}, "extra": 1}),
        # Changing it afterwards.
        case("ALLOW", "update", me, new={"votes": {"test-other": "B", "test-student": "A"}}, old=existing),
        case("ALLOW", "update", me, new={"votes": {"test-other": "B"}}, old={"data": {"votes": {"test-other": "B", "test-student": "A"}}}),
        case("DENY", "update", me, new={"votes": {"test-other": "A"}}, old=existing),
        case("DENY", "update", me, new={"votes": {"test-student": "A"}}, old=existing),
        case("DENY", "update", me, new={"votes": {"test-other": "B", "test-student": "Z"}}, old=existing),
        case("DENY", "update", None, new={"votes": {"test-other": "B", "test-student": "A"}}, old=existing),
        case("DENY", "delete", me, old=existing),
        case("DENY", "delete", other, old=existing),
    ]


def refresh_tests():
    """Real timestamp, owner, pending-work and field-ownership boundary cases."""
    now = datetime(2026, 11, 21, 6, 0, tzinfo=timezone.utc)

    def at(seconds=0):
        # The Rules test API decodes RFC3339 values as Rules timestamps.
        return (now + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")

    owners = [
        {"uid": "owner-one", "token": {"email": "hajunk105@gmail.com", "email_verified": True}},
        {"uid": "owner-two", "token": {"email": "hjkim29@kis.ac", "email_verified": True}},
    ]
    unauthorized = [
        None,
        {"uid": "student", "token": {"email": "student@example.test", "email_verified": True}},
        {"uid": "unverified-owner", "token": {"email": "hajunk105@gmail.com", "email_verified": False}},
        {"uid": "owner-without-claim", "token": {"email": "hjkim29@kis.ac"}},
    ]

    def case(expected, method, auth, new=None, old=None, path="hs"):
        request = {"path": f"/databases/(default)/documents/cafeteriaMenuRefresh/{path}",
                   "method": method, "auth": auth, "time": at()}
        if new is not None:
            request["resource"] = {"data": new}
        result = {"expectation": expected, "request": request}
        if old is not None:
            result["resource"] = {"data": old}
        return result

    completed = {"requestedAt": at(-120), "processedRequestAt": at(-120), "status": "complete"}
    cases = []
    for auth in owners + unauthorized:
        allowed = auth in owners
        cases.extend([
            case("ALLOW" if allowed else "DENY", "get", auth, old=completed),
            case("DENY", "list", auth),
            case("DENY", "delete", auth, old=completed),
            case("ALLOW" if allowed else "DENY", "create", auth, new={"requestedAt": at()}),
            case("ALLOW" if allowed else "DENY", "update", auth,
                 new={**completed, "requestedAt": at()}, old=completed),
        ])
    owner = owners[0]
    cases.extend(case("ALLOW", "get", auth) for auth in owners)
    for invalid in ({}, {"requestedAt": at(-1)}, {"requestedAt": at(1)},
                    {"requestedAt": 1795240800}, {"requestedAt": "not-a-timestamp"},
                    {"requestedAt": at(), "status": "complete"},
                    {"requestedAt": at(), "processedRequestAt": at()},
                    {"requestedAt": at(), "runningRequestAt": at()},
                    {"requestedAt": at(), "extra": True}):
        cases.append(case("DENY", "create", owner, new=invalid))
    # The cooldown applies globally, including requests from the other owner.
    for auth in owners:
        recent = {"requestedAt": at(-119), "processedRequestAt": at(-119), "status": "complete"}
        cases.append(case("DENY", "update", auth, new={**recent, "requestedAt": at()}, old=recent))
    for age, expected in ((120, "DENY"), (1800, "DENY"), (2100, "DENY"), (2101, "ALLOW")):
        pending = {"requestedAt": at(-age), "runningRequestAt": at(-age), "status": "running"}
        cases.append(case(expected, "update", owner, new={**pending, "requestedAt": at()}, old=pending))
    stale_result = {"requestedAt": at(-120), "processedRequestAt": at(-240), "status": "complete"}
    cases.append(case("DENY", "update", owner,
                      new={**stale_result, "requestedAt": at()}, old=stale_result))
    for field, value in (("status", "running"), ("processedRequestAt", at()),
                         ("runningRequestAt", at()), ("extra", True)):
        cases.append(case("DENY", "update", owner,
                          new={**completed, "requestedAt": at(), field: value}, old=completed))
    cases.append(case("DENY", "update", owner, new={"requestedAt": at()}, old=completed))
    for old in ({}, {"requestedAt": 123}, {"requestedAt": "not-a-timestamp"}):
        cases.append(case("DENY", "update", owner, new={**old, "requestedAt": at()}, old=old))
    for invalid in (at(-1), at(1), 1795240800, "not-a-timestamp"):
        cases.append(case("DENY", "update", owner,
                          new={**completed, "requestedAt": invalid}, old=completed))
    for method in ("get", "create", "update"):
        cases.append(case("DENY", method, owner, new={"requestedAt": at()},
                          old=completed if method != "create" else None, path="other"))
    return cases


def refresh_regression_tests():
    """The additive refresh deployment must retain existing owner menu editing."""
    cases = []
    for auth in (None, {"uid": "student", "token": {"email": "student@example.test"}},
                 {"uid": "owner", "token": {"email": "hajunk105@gmail.com"}},
                 {"uid": "owner-two", "token": {"email": "hjkim29@kis.ac"}}):
        owner = auth is not None and auth["token"]["email"] in ("hajunk105@gmail.com", "hjkim29@kis.ac")
        for collection in ("cafeteriaMenus", "cafeteriaMenuSources"):
            for method in ("get", "list", "create", "update", "delete"):
                allow = collection == "cafeteriaMenus" and (method in ("get", "list") or (owner and method == "update"))
                cases.append({"expectation": "ALLOW" if allow else "DENY",
                              "request": {"path": f"/databases/(default)/documents/{collection}/hs-2026-11-16",
                                          "method": method, "auth": auth, "resource": {"data": {"days": []}}},
                              "resource": {"data": {"days": []}}})
    return cases + vote_tests()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="kisj-grade-calculator")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--refresh", action="store_true",
                        help="Add only verified-owner OCR refresh rules to the current live rules")
    parser.add_argument("--backup", type=Path, default=Path("/tmp/kisj-menu-rules-backup.json"))
    args = parser.parse_args()
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
               "x-goog-user-project": args.project}

    def api(path, data=None, method=None):
        request = urllib.request.Request(
            "https://firebaserules.googleapis.com/v1/" + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers=headers, method=method,
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)

    release_path = f"projects/{args.project}/releases/cloud.firestore"
    release = api(release_path)
    ruleset = api(release["rulesetName"])
    source = deepcopy(ruleset["source"])
    files = [file for file in source["files"] if file["name"] == "firestore.rules"]
    if len(files) != 1:
        raise ValueError("Expected one live firestore.rules file")
    old = files[0]["content"]
    if args.refresh:
        files[0]["content"] = merge_refresh_rules(old)
        cases = refresh_tests() + refresh_regression_tests()
        label = "Owner refresh rules"
    else:
        files[0]["content"] = merge_vote_rules(merge_rules(old))
        cases = tests() + vote_tests()
        label = "Menu and vote rules"
    files[0].pop("fingerprint", None)
    result = api(f"projects/{args.project}:test", {"source": source, "testSuite": {"testCases": cases}})
    issues = [issue for issue in result.get("issues", []) if issue.get("severity") == "ERROR"]
    failed = [test for test in result.get("testResults", []) if test.get("state") != "SUCCESS"]
    if issues or failed or len(result.get("testResults", [])) != len(cases):
        raise RuntimeError(json.dumps({"issues": issues, "failures": failed})[:8000])
    print(f"{label} compiled; {len(cases)} access-control tests passed")
    if args.apply and files[0]["content"] != old:
        args.backup.write_text(json.dumps({"release": release, "ruleset": ruleset}, indent=2) + "\n")
        created = api(f"projects/{args.project}/rulesets", {"source": source})
        # Abort if another deploy occurred after our read/test.
        if api(release_path)["rulesetName"] != release["rulesetName"]:
            raise RuntimeError("Live rules changed during deployment; retry against the new version")
        api(release_path + "?updateMask=rulesetName", {
            "release": {"name": release_path, "rulesetName": created["name"]},
        }, method="PATCH")
        if api(release_path)["rulesetName"] != created["name"]:
            raise RuntimeError("Rules activation verification failed")
        print(f"{label} activated; all pre-existing rules retained. Backup:", args.backup)
    elif args.apply:
        print(f"{label} already active")
    else:
        print("No activation requested; live rules were not changed")


if __name__ == "__main__":
    main()

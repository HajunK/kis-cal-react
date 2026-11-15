"""Add only the menu and lunch vote rules to the live ruleset, preserving newer deployed app rules.

Uses the currently signed-in gcloud account. No credentials are stored.
Default: compile and test. --apply additionally activates the tested ruleset.
"""

import argparse
from copy import deepcopy
import json
from pathlib import Path
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="kisj-grade-calculator")
    parser.add_argument("--apply", action="store_true")
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
    files[0]["content"] = merge_vote_rules(merge_rules(old))
    files[0].pop("fingerprint", None)
    result = api(f"projects/{args.project}:test", {"source": source, "testSuite": {"testCases": tests() + vote_tests()}})
    issues = [issue for issue in result.get("issues", []) if issue.get("severity") == "ERROR"]
    failed = [test for test in result.get("testResults", []) if test.get("state") != "SUCCESS"]
    if issues or failed or len(result.get("testResults", [])) != len(tests()) + len(vote_tests()):
        raise RuntimeError(json.dumps({"issues": issues, "failures": failed})[:8000])
    print(f"Menu and vote rules compiled; {len(tests()) + len(vote_tests())} access-control tests passed")
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
        print("Menu and vote rules activated; all pre-existing rules retained. Backup:", args.backup)
    elif args.apply:
        print("Menu and vote rules already active")


if __name__ == "__main__":
    main()

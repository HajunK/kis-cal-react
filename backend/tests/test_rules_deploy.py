import importlib.util
import json
from pathlib import Path
import sys

import pytest

spec = importlib.util.spec_from_file_location("publish_rules", Path(__file__).parents[1] / "deploy/publish_rules.py")
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


def test_live_rules_patch_is_additive_and_idempotent():
    original = """rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /private/{id} { allow read: if request.auth != null; }
  }
}"""
    merged = rules.merge_rules(original)
    assert merged.replace("\n" + rules.MENU_RULES, "", 1) == original
    assert rules.merge_rules(merged) == merged


def test_rules_patch_refuses_conflicting_existing_menu_rules():
    with pytest.raises(ValueError, match="different content"):
        rules.merge_rules("match /cafeteriaMenus/{id} { allow write: if true; }")


def test_vote_rules_are_added_after_the_menu_rules_and_are_idempotent():
    original = """rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /private/{id} { allow read: if request.auth != null; }
  }
}"""
    with_menu = rules.merge_rules(original)
    merged = rules.merge_vote_rules(with_menu)
    assert merged.replace(rules.VOTE_RULES, "", 1) == with_menu
    assert rules.merge_vote_rules(merged) == merged


def test_vote_rules_refuse_conflicting_existing_vote_rules():
    menu = rules.merge_rules("match /databases/{database}/documents {\n}")
    with pytest.raises(ValueError, match="different content"):
        rules.merge_vote_rules(menu + "\nmatch /cafeteriaVotes/{id} { allow write: if true; }")


def test_vote_cases_cover_each_way_in():
    cases = rules.vote_tests()
    assert {case["request"]["method"] for case in cases} == {"get", "list", "create", "update", "delete"}
    assert all(case["expectation"] in {"ALLOW", "DENY"} for case in cases)


OWNER_RULES = """rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() { return request.auth != null; }
    // Existing deployed owner correction policy, which must not be replaced.
    match /cafeteriaMenus/{id} { allow read: if true; allow update: if isAdmin(); }
    match /cafeteriaVotes/{id} { allow read: if isAdmin(); }
    match /unrelated/{id} { allow write: if false; }
  }
}"""


def test_refresh_merge_preserves_existing_admin_and_vote_rules_exactly():
    merged = rules.merge_refresh_rules(OWNER_RULES)
    assert merged.replace("\n" + rules.REFRESH_RULES, "", 1) == OWNER_RULES
    assert rules.merge_refresh_rules(merged) == merged


@pytest.mark.parametrize("conflict", [
    "match /cafeteriaMenuRefresh/hs { allow write: if true; }",
    "match /cafeteriaMenuRefresh/{id} { allow read: if true; }",
    "match   /cafeteriaMenuRefresh/hs { allow write: if false; }",
])
def test_refresh_merge_refuses_an_existing_conflicting_policy(conflict):
    with pytest.raises(ValueError, match="different content"):
        rules.merge_refresh_rules(OWNER_RULES + "\n" + conflict)


def test_refresh_merge_requires_the_existing_owner_policy_and_one_anchor():
    with pytest.raises(ValueError, match="isAdmin"):
        rules.merge_refresh_rules("match /databases/{database}/documents { }")
    with pytest.raises(ValueError, match="safely locate"):
        rules.merge_refresh_rules(OWNER_RULES + OWNER_RULES)


def test_refresh_merge_refuses_a_second_block_even_when_the_expected_block_exists():
    existing = rules.merge_refresh_rules(OWNER_RULES)
    with pytest.raises(ValueError, match="different content"):
        rules.merge_refresh_rules(existing + "\nmatch /cafeteriaMenuRefresh/{id} { allow write: if true; }")


def test_local_refresh_rule_matches_the_live_additive_block():
    source = (Path(__file__).parents[2] / "firestore.rules").read_text()
    assert source.count(rules.REFRESH_RULES.strip()) == 1


def test_refresh_no_apply_uses_only_additive_merge_and_test_api(monkeypatch, tmp_path, capsys):
    backup = tmp_path / "must-not-be-written.json"
    monkeypatch.setattr(sys, "argv", ["publish_rules.py", "--refresh", "--backup", str(backup)])
    monkeypatch.setattr(rules.subprocess, "check_output", lambda *args, **kwargs: "test-token")

    def forbidden_legacy_merge(*args):
        raise AssertionError("Refresh deployment must not use old menu/vote merge logic")

    monkeypatch.setattr(rules, "merge_rules", forbidden_legacy_merge)
    monkeypatch.setattr(rules, "merge_vote_rules", forbidden_legacy_merge)
    release = {"rulesetName": "projects/kisj-grade-calculator/rulesets/existing"}
    source = {"files": [{"name": "firestore.rules", "content": OWNER_RULES, "fingerprint": "old-fingerprint"}]}
    requests = []

    class Response:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps(self.payload).encode()

    def api(request, timeout):
        requests.append(request)
        assert request.get_header("X-goog-user-project") == "kisj-grade-calculator"
        if request.full_url.endswith("/releases/cloud.firestore"):
            return Response(release)
        if request.full_url.endswith("/rulesets/existing"):
            return Response({"source": source})
        assert request.full_url.endswith(":test")
        assert request.get_method() == "POST"
        payload = json.loads(request.data)
        actual = payload["source"]["files"][0]
        assert actual["content"].replace("\n" + rules.REFRESH_RULES, "", 1) == OWNER_RULES
        assert "fingerprint" not in actual
        assert source["files"][0]["fingerprint"] == "old-fingerprint"
        cases = payload["testSuite"]["testCases"]
        assert cases == rules.refresh_tests() + rules.refresh_regression_tests()
        return Response({"testResults": [{"state": "SUCCESS"} for _ in cases]})

    monkeypatch.setattr(rules.urllib.request, "urlopen", api)
    rules.main()
    assert [request.get_method() for request in requests] == ["GET", "GET", "POST"]
    assert not backup.exists()
    assert "No activation requested" in capsys.readouterr().out

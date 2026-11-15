import importlib.util
from pathlib import Path

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

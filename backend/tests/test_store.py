import json

from menu_scraper import store


class Snapshot:
    def __init__(self, data):
        self.exists = data is not None
        self.data = data

    def to_dict(self):
        return self.data


class Document:
    def __init__(self, db, path):
        self.db, self.path = db, path

    def get(self, **kwargs):
        return Snapshot(self.db.data.get(self.path))


class Collection:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def document(self, name):
        return Document(self.db, (self.name, name))


class Database:
    def __init__(self, data=None):
        self.data = data or {}

    def collection(self, name):
        return Collection(self, name)

    def transaction(self):
        return self

    def set(self, document, data):
        self.data[document.path] = data


def test_older_post_cannot_replace_newer_week_but_gets_cached(monkeypatch):
    monkeypatch.setattr(store.firestore, "transactional", lambda function: function)
    current = {"school": "HS", "source": {"postId": "102"}}
    db = Database({("cafeteriaMenus", "hs-2026-11-09"): current})
    old = {"school": "HS", "weekStart": "2026-11-09", "source": {"postId": "101"},
           "sourceHash": "older-hash", "pipelineVersion": 1}
    assert store.publish(db, old) == "superseded"
    assert db.data[("cafeteriaMenus", "hs-2026-11-09")] is current
    assert db.data[("cafeteriaMenuSources", "hs-101")]["status"] == "superseded"
    assert store.unchanged(db, "101", "older-hash", 1)


def test_hash_cache_does_not_hide_missing_week_or_pipeline_revision():
    db = Database({("cafeteriaMenuSources", "hs-101"): {
        "menuId": "hs-2026-11-09", "sourceHash": "same", "pipelineVersion": 1,
    }})
    assert not store.unchanged(db, "101", "same", 1)
    db.data[("cafeteriaMenus", "hs-2026-11-09")] = {"school": "HS"}
    assert store.unchanged(db, "101", "same", 1)
    assert not store.unchanged(db, "101", "revised", 1)
    assert not store.unchanged(db, "101", "same", 2)


def menu_week(post_id, a, b, *, manual=False):
    return {
        "school": "HS", "source": {"postId": post_id}, "sourceHash": f"hash-{post_id}",
        "pipelineVersion": 1, "weekStart": "2026-11-09", "ocr": {"generatedAt": post_id},
        "days": [{"date": "2026-11-09", "meals": {"lunch": {"ko": [
            {"status": "printed", "section": "A", "text": a, "lines": [a],
             **({"manual": True} if manual else {})},
            {"status": "printed", "section": "B", "text": b, "lines": [b]},
        ]}}}],
    }


def test_exact_archive_recovers_existing_editor_text_and_other_options_still_update(monkeypatch, tmp_path):
    monkeypatch.setattr(store.firestore, "transactional", lambda function: function)
    key = ("cafeteriaMenus", "hs-2026-11-09")
    original = menu_week("100", "OCR typo", "Old menu B")
    current = menu_week("100", "Owner's correction", "Old menu B")
    current["days"][0]["meals"]["lunch"]["ko"][0]["lines"] = ["OCR typo"]
    (tmp_path / "hs-2026-11-09-post-100.json").write_text(json.dumps(original))
    db = Database({key: current})
    revision = menu_week("101", "Different OCR", "New menu B")
    assert store.publish(db, revision, archive_dir=tmp_path) == "published"
    saved = db.data[key]["days"][0]["meals"]["lunch"]["ko"]
    assert saved[0] == {
        "status": "printed", "section": "A", "text": "Owner's correction",
        "lines": ["Owner's correction"], "manual": True,
    }
    assert saved[1]["text"] == "New menu B"
    assert revision["days"][0]["meals"]["lunch"]["ko"][0]["text"] == "Different OCR"

    assert store.publish(db, menu_week("101", "Next OCR attempt", "Revised B")) == "published"
    assert db.data[key]["days"][0]["meals"]["lunch"]["ko"][0] == saved[0]


def test_stale_archive_does_not_mark_plain_ocr_as_manual(monkeypatch, tmp_path):
    monkeypatch.setattr(store.firestore, "transactional", lambda function: function)
    key = ("cafeteriaMenus", "hs-2026-11-09")
    stale = menu_week("100", "Stale OCR", "Old menu B")
    stale["ocr"]["generatedAt"] = "older run"
    (tmp_path / "hs-2026-11-09-post-100.json").write_text(json.dumps(stale))
    db = Database({key: menu_week("100", "Actual OCR", "Old menu B")})
    assert store.publish(db, menu_week("101", "New OCR", "New menu B"), archive_dir=tmp_path) == "published"
    assert db.data[key]["days"][0]["meals"]["lunch"]["ko"][0]["text"] == "New OCR"


def test_correction_survives_unpublished_day_and_explicit_closure(monkeypatch):
    monkeypatch.setattr(store.firestore, "transactional", lambda function: function)
    key = ("cafeteriaMenus", "hs-2026-11-09")
    db = Database({key: menu_week("100", "Manual A", "Old menu B", manual=True)})
    closed = menu_week("101", "New OCR", "New menu B")
    closure = {"section": "closure", "status": "closed", "text": "Cafeteria closed"}
    closed["days"][0]["meals"]["lunch"]["en"] = [closure]
    assert store.publish(db, closed) == "published"
    assert db.data[key]["days"][0]["meals"]["lunch"]["ko"][0]["text"] == "New OCR"
    assert db.data[key]["inactiveManualOptions"][0]["option"]["text"] == "Manual A"

    assert store.publish(db, {**menu_week("102", "", ""), "days": []}) == "published"
    assert db.data[key]["inactiveManualOptions"][0]["option"]["text"] == "Manual A"

    assert store.publish(db, menu_week("103", "Reopening A", "Reopening B")) == "published"
    assert db.data[key]["days"][0]["meals"]["lunch"]["ko"][0]["text"] == "Manual A"
    assert "inactiveManualOptions" not in db.data[key]

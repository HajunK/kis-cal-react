"""Atomic publication and content-hash caching in the existing Firestore project."""

from copy import deepcopy
import json
from pathlib import Path

from google.cloud import firestore

MENUS = "cafeteriaMenus"
SOURCES = "cafeteriaMenuSources"


def menu_options(days):
    for day in days:
        for meal, languages in day["meals"].items():
            for language, options in languages.items():
                for option in options:
                    yield (day["date"], meal, language, option["section"]), option


def previous_ocr_days(current: dict, week_start: str, archive_dir: Path | None) -> list:
    # The older editor changed only text. Compare against the exact prior OCR run.
    if archive_dir is None or not current.get("ocr", {}).get("generatedAt"):
        return []
    post_id = int(current["source"]["postId"])
    archive = archive_dir / f"hs-{week_start}-post-{post_id}.json"
    if not archive.is_file():
        return []
    original = json.loads(archive.read_text(encoding="utf-8"))
    if (original.get("sourceHash") != current.get("sourceHash")
            or original.get("ocr", {}).get("generatedAt") != current["ocr"]["generatedAt"]):
        return []
    return original["days"]


def preserve_manual_options(menu: dict, current: dict, archive_dir: Path | None) -> dict:
    corrections = {tuple(item["location"]): item["option"] for item in current.get("inactiveManualOptions", [])}
    originals = dict(menu_options(previous_ocr_days(current, menu["weekStart"], archive_dir)))
    for key, option in menu_options(current.get("days", [])):
        if option["status"] != "printed" or key[-1] not in {"A", "B"}:
            continue
        original = originals.get(key)
        if option.get("manual") is True or (original and option["text"] != original["text"]):
            corrections[key] = {**option, "lines": option["text"].splitlines(), "manual": True}
    if not corrections:
        return menu

    days = deepcopy(menu["days"])
    by_date = {day["date"]: day for day in days}
    inactive = []
    for location, correction in corrections.items():
        date, meal, language, section = location
        day = by_date.get(date)
        if day is None or any(option["status"] == "closed"
                              for options in day["meals"].get(meal, {}).values()
                              for option in options):
            inactive.append({"location": list(location), "option": correction})
            continue
        options = day["meals"].setdefault(meal, {}).setdefault(language, [])
        for index, option in enumerate(options):
            if option["section"] == section:
                options[index] = correction
                break
        else:
            options.append(correction)
    published = {**menu, "days": days}
    if inactive:
        published["inactiveManualOptions"] = inactive
    return published


def unchanged(db, post_id: str, digest: str, version: int) -> bool:
    snapshot = db.collection(SOURCES).document(f"hs-{post_id}").get()
    data = snapshot.to_dict() if snapshot.exists else {}
    if data.get("sourceHash") != digest or data.get("pipelineVersion") != version:
        return False
    menu_id = data.get("menuId")
    return bool(menu_id and db.collection(MENUS).document(menu_id).get().exists)


def publish(db, menu: dict, *, archive_dir: Path | None = None) -> str:
    if menu.get("school") != "HS":
        raise ValueError("Only HS menus may be published")
    menu_id = f"hs-{menu['weekStart']}"
    document = db.collection(MENUS).document(menu_id)
    source = db.collection(SOURCES).document(f"hs-{menu['source']['postId']}")

    @firestore.transactional
    def commit(transaction):
        existing = document.get(transaction=transaction)
        current = existing.to_dict() if existing.exists else {}
        marker = {
            "school": "HS", "menuId": menu_id,
            "sourceHash": menu["sourceHash"], "pipelineVersion": menu["pipelineVersion"],
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        # An older archive post must never replace a newer revision of the same week.
        if int(current.get("source", {}).get("postId", 0)) > int(menu["source"]["postId"]):
            transaction.set(source, {**marker, "status": "superseded"})
            return "superseded"
        published = preserve_manual_options(menu, current, archive_dir)
        if len(json.dumps(published, ensure_ascii=False).encode()) > 850_000:
            raise ValueError("Menu is too large for one Firestore document")
        transaction.set(document, {**published, "updatedAt": firestore.SERVER_TIMESTAMP})
        transaction.set(source, {**marker, "status": "published"})
        return "published"

    return commit(db.transaction())

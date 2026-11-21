"""Watch the owner-only Firestore request and run the existing HS scraper."""

import argparse
from datetime import datetime
import logging
import os
from pathlib import Path
import signal
import subprocess
import sys
from threading import Event

import firebase_admin
from firebase_admin import firestore

LOGGER = logging.getLogger(__name__)
RUN_TIMEOUT = 30 * 60
FIRESTORE_TIMEOUT = 30


def run_scraper(output: Path, project: str) -> None:
    command = [
        sys.executable, "-m", "menu_scraper", "--force", "--limit", "3",
        "--output", str(output), "--project", project,
    ]
    with subprocess.Popen(command, start_new_session=True) as process:
        try:
            returncode = process.wait(timeout=RUN_TIMEOUT)
        except subprocess.TimeoutExpired:
            # Tesseract and the scraper share this process group.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            raise
        if returncode:
            raise subprocess.CalledProcessError(returncode, command)


def process_pending(document, *, output: Path, project: str) -> None:
    data = document.get(timeout=FIRESTORE_TIMEOUT).to_dict() or {}
    requested = data.get("requestedAt")
    processed = data.get("processedRequestAt")
    if not isinstance(requested, datetime) or (
        isinstance(processed, datetime) and requested <= processed
    ):
        return

    document.update(
        {"runningRequestAt": requested, "status": "running"},
        timeout=FIRESTORE_TIMEOUT,
    )
    LOGGER.info("Starting requested HS menu OCR refresh")
    try:
        run_scraper(output, project)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        LOGGER.error("Requested HS menu refresh failed (%s)", type(error).__name__)
        status = "failed"
    else:
        LOGGER.info("Requested HS menu refresh succeeded")
        status = "succeeded"
    document.update(
        {"processedRequestAt": requested, "status": status},
        timeout=FIRESTORE_TIMEOUT,
    )


def listen(document, *, output: Path, project: str) -> None:
    wake = Event()

    def changed(_snapshots, _changes, _read_time):
        wake.set()

    watch = document.on_snapshot(changed)
    wake.set()
    LOGGER.info("Watching for HS menu refresh requests")
    try:
        while watch.is_active:
            if wake.wait(timeout=30):
                wake.clear()
                process_pending(document, output=output, project=project)
        raise RuntimeError("Firestore refresh watch disconnected")
    finally:
        watch.unsubscribe()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("var/menus"))
    parser.add_argument("--project", default=os.getenv("FIREBASE_PROJECT_ID", "kisj-grade-calculator"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app = firebase_admin.initialize_app(options={"projectId": args.project})
    db = firestore.client(app)
    try:
        document = db.collection("cafeteriaMenuRefresh").document("hs")
        listen(document, output=args.output, project=args.project)
    finally:
        db.close()
        firebase_admin.delete_app(app)


if __name__ == "__main__":
    main()

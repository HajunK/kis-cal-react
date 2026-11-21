from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from menu_scraper import refresh


REQUESTED = datetime(2026, 11, 21, 3, tzinfo=timezone.utc)
OUTPUT = Path("/app/var/menus")
PROJECT = "test-project"


class Document:
    def __init__(self, **data):
        self.data = data
        self.updates = []

    def get(self, *, timeout):
        return SimpleNamespace(to_dict=self.data.copy)

    def update(self, fields, *, timeout):
        self.updates.append(fields)
        self.data.update(fields)


@pytest.mark.parametrize("data", [{}, {"status": "succeeded", "requestedAt": REQUESTED,
                                     "processedRequestAt": REQUESTED}])
def test_idle_or_processed_requests_are_skipped(monkeypatch, data):
    scraper = Mock()
    monkeypatch.setattr(refresh, "run_scraper", scraper)
    document = Document(**data)

    refresh.process_pending(document, output=OUTPUT, project=PROJECT)

    scraper.assert_not_called()
    assert not document.updates


def test_unfinished_request_retries_after_worker_restart(monkeypatch):
    document = Document(requestedAt=REQUESTED, runningRequestAt=REQUESTED, status="running")
    scraper = Mock()
    monkeypatch.setattr(refresh, "run_scraper", scraper)

    refresh.process_pending(document, output=OUTPUT, project=PROJECT)

    scraper.assert_called_once_with(OUTPUT, PROJECT)
    assert document.updates == [
        {"runningRequestAt": REQUESTED, "status": "running"},
        {"processedRequestAt": REQUESTED, "status": "succeeded"},
    ]


@pytest.mark.parametrize("error", [
    subprocess.CalledProcessError(1, ["python"]),
    subprocess.TimeoutExpired(["python"], refresh.RUN_TIMEOUT),
    OSError("child process could not be started"),
])
def test_scraper_failure_becomes_terminal_for_that_request(monkeypatch, error):
    scraper = Mock(side_effect=error)
    monkeypatch.setattr(refresh, "run_scraper", scraper)
    document = Document(requestedAt=REQUESTED)

    refresh.process_pending(document, output=OUTPUT, project=PROJECT)
    refresh.process_pending(document, output=OUTPUT, project=PROJECT)

    scraper.assert_called_once_with(OUTPUT, PROJECT)
    assert document.data == {
        "requestedAt": REQUESTED,
        "runningRequestAt": REQUESTED,
        "processedRequestAt": REQUESTED,
        "status": "failed",
    }


def test_completion_keeps_a_newer_request_pending(monkeypatch):
    document = Document(requestedAt=REQUESTED)
    newer = REQUESTED + timedelta(minutes=31)
    scraper = Mock(side_effect=lambda *_: document.data.update(requestedAt=newer))
    monkeypatch.setattr(refresh, "run_scraper", scraper)

    refresh.process_pending(document, output=OUTPUT, project=PROJECT)
    assert document.data["requestedAt"] == newer
    assert document.data["processedRequestAt"] == REQUESTED

    refresh.process_pending(document, output=OUTPUT, project=PROJECT)
    assert document.data["processedRequestAt"] == newer


def test_watch_processes_pending_at_startup_and_exits_on_disconnect(monkeypatch):
    class Watch:
        active = iter([True, False])
        unsubscribe = Mock()

        @property
        def is_active(self):
            return next(self.active)

    watch = Watch()
    document = Document(requestedAt=REQUESTED)
    document.on_snapshot = Mock(return_value=watch)
    scraper = Mock()
    monkeypatch.setattr(refresh, "run_scraper", scraper)

    with pytest.raises(RuntimeError, match="watch disconnected"):
        refresh.listen(document, output=OUTPUT, project=PROJECT)

    scraper.assert_called_once_with(OUTPUT, PROJECT)
    assert document.data["processedRequestAt"] == REQUESTED
    watch.unsubscribe.assert_called_once()

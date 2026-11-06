"""Fixtures for HomeBrain integration tests."""

import asyncio
import builtins
import io
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integration loading through the pytest HA plugin."""


@pytest.fixture(autouse=True)
def frontend_assets(tmp_path):
    """Avoid requiring HA's compiled UI assets for backend registration tests."""
    with patch("homeassistant.components.frontend._frontend_root", return_value=tmp_path):
        yield


@pytest.fixture(autouse=True)
def weather_autostart_off():
    """Weather fetch timers only run in tests that start the manager explicitly."""
    with patch("custom_components.homebrain.weather.AUTOSTART", False):
        yield


@pytest.fixture
def hass_config_dir(tmp_path: Path) -> str:
    """Keep HA storage private to each test, including concurrent worktree runs."""
    config_dir = tmp_path / "ha-config"
    config_dir.mkdir()
    return str(config_dir)


# --- Event-loop hygiene (#28) ------------------------------------------------------------
# HA's own blocking-call detection (homeassistant.block_async_io) is off in tests and skips
# ``open`` there, so this fixture patches the usual blocking primitives and records every
# call made on the event-loop thread *from HomeBrain code that the loop runs by itself*
# (WS handlers, HTTP views, listeners, tasks). Calls whose stack contains a test frame are
# ignored: a test may call a sync helper directly. Any record fails the test at teardown.
_HB_DIR = os.sep + os.path.join("custom_components", "homebrain") + os.sep
_TESTS_DIR = os.sep + os.path.join("tests", "python") + os.sep
_NOISE = ("linecache.py", "traceback.py", "format_helpers.py")
_BLOCKING_TARGETS: list[tuple[object, str]] = [
    (builtins, "open"),
    (io, "open"),
    (time, "sleep"),
    (os, "listdir"),
    (os, "scandir"),
    (os, "walk"),
    (os, "remove"),
    (os, "unlink"),
    (os, "mkdir"),
    (os, "makedirs"),
    (os, "replace"),
    (urllib.request, "urlopen"),
]


def _blocking_offender() -> str | None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None
    if loop is None or threading.current_thread() is not threading.main_thread():
        return None
    offender = None
    frame = sys._getframe(2)
    while frame is not None:
        name = frame.f_code.co_filename
        # Test code, and asyncio debug-mode traceback capture (linecache), are not ours.
        if _TESTS_DIR in name or name.endswith(_NOISE):
            return None
        if offender is None and _HB_DIR in name:
            offender = f"{name.split(_HB_DIR)[1]}:{frame.f_lineno} ({frame.f_code.co_name})"
        frame = frame.f_back
    return offender


@pytest.fixture(autouse=True)
def fail_on_blocking_calls(request):
    """Fail when HomeBrain code does blocking I/O on the event loop (all WS handlers)."""
    if "allow_blocking_calls" in request.keywords:
        yield []
        return
    found: list[str] = []

    def wrap(owner: object, attr: str):
        original = getattr(owner, attr)

        def guarded(*args, **kwargs):
            if (where := _blocking_offender()) is not None:
                found.append(f"{getattr(owner, '__name__', owner)}.{attr} at {where}")
            return original(*args, **kwargs)

        return original, guarded

    patched = []
    for owner, attr in _BLOCKING_TARGETS:
        original, guarded = wrap(owner, attr)
        setattr(owner, attr, guarded)
        patched.append((owner, attr, original))
    try:
        yield found
    finally:
        for owner, attr, original in reversed(patched):
            setattr(owner, attr, original)
    if found:
        pytest.fail(
            "Blocking call(s) in the event loop:\n" + "\n".join(sorted(set(found))),
            pytrace=False,
        )

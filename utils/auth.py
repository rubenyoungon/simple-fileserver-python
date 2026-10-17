"""Single-user login: credentials come from environment variables, never from plain text.

Run ``python -m utils.auth`` to generate the password hash for FILESERVER_PASSWORD_HASH.
"""
import getpass
import hashlib
import hmac
import os
import threading
import time
from urllib.parse import urlsplit

from werkzeug.security import check_password_hash, generate_password_hash

USERNAME_ENV = "FILESERVER_USERNAME"
PASSWORD_HASH_ENV = "FILESERVER_PASSWORD_HASH"

# Checked when the username is wrong, so a wrong username takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash("not-the-password")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60


def load_credentials():
    """Return (username, password_hash), or None if either environment variable is missing."""
    username = os.environ.get(USERNAME_ENV, "").strip()
    password_hash = os.environ.get(PASSWORD_HASH_ENV, "").strip()
    if not username or not password_hash:
        return None
    return username, password_hash


def credentials_fingerprint(password_hash: str) -> str:
    """Short value stored in the session; changing the password invalidates every existing login."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def verify_credentials(credentials, username: str, password: str) -> bool:
    expected_username, password_hash = credentials
    username_ok = hmac.compare_digest(username.encode(), expected_username.encode())
    password_ok = check_password_hash(password_hash if username_ok else _DUMMY_HASH, password)
    return username_ok and password_ok


def safe_next_url(target, default: str) -> str:
    """Only follow same-site relative paths after login, so /login can't be used as an open redirect."""
    if not target or not target.startswith("/") or target.startswith("//") or "\\" in target:
        return default
    parts = urlsplit(target)
    if parts.scheme or parts.netloc:
        return default
    return target


class LoginThrottle:
    """Locks an address out for LOCKOUT_SECONDS after MAX_FAILED_ATTEMPTS failed logins (in memory)."""

    def __init__(self):
        self._failures = {}  # address -> list of failure timestamps
        self._lock = threading.Lock()

    def _recent(self, address, now):
        recent = [t for t in self._failures.get(address, []) if now - t < LOCKOUT_SECONDS]
        if recent:
            self._failures[address] = recent
        else:
            self._failures.pop(address, None)
        return recent

    def retry_after(self, address) -> int:
        """Seconds until the address may try again, or 0 if it is not locked out."""
        now = time.monotonic()
        with self._lock:
            recent = self._recent(address, now)
            if len(recent) < MAX_FAILED_ATTEMPTS:
                return 0
            return max(1, int(LOCKOUT_SECONDS - (now - recent[-MAX_FAILED_ATTEMPTS])))

    def record_failure(self, address):
        now = time.monotonic()
        with self._lock:
            self._recent(address, now)
            self._failures.setdefault(address, []).append(now)

    def reset(self, address):
        with self._lock:
            self._failures.pop(address, None)


def main():
    password = getpass.getpass("New password: ")
    if not password:
        raise SystemExit("Password must not be empty.")
    if getpass.getpass("Repeat password: ") != password:
        raise SystemExit("Passwords do not match.")
    print(f"\nSet this as {PASSWORD_HASH_ENV} (quote it: it contains '$'):\n")
    print(generate_password_hash(password))


if __name__ == "__main__":
    main()

"""Password and token helpers for the user directory service."""

import hashlib
import hmac
import re
import secrets

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    salt_hex, digest_hex = stored.split(":", 1)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **SCRYPT_PARAMS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def make_reset_token():
    return secrets.token_urlsafe(32)


def is_valid_email(email):
    return len(email) <= 254 and EMAIL_RE.fullmatch(email) is not None

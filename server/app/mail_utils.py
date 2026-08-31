"""Shared bits for every outgoing email in the application.

Without a display name, mail clients fall back to the part of the address
before the '@' — so mails from kalacares@kalabiz.com showed up as "kalacares".
Every sender therefore builds its From header through from_header() so the
recipient always sees one consistent company name.

Change the name in server/.env (FROM_NAME) — no code change needed.
"""

import os
from email.utils import formataddr

DEFAULT_FROM_NAME = "KALA Care Global LLP"


def sender_name() -> str:
    """The company name recipients see in their inbox."""
    return os.getenv("FROM_NAME") or DEFAULT_FROM_NAME


def from_header(email_address: str) -> str:
    """'KALA Care Global LLP <kalacares@kalabiz.com>' for the From header."""
    return formataddr((sender_name(), email_address or ""))


def reply_to(email_address: str) -> str:
    """Where replies go — REPLY_TO_EMAIL, else the sending address."""
    return os.getenv("REPLY_TO_EMAIL") or email_address or ""


def smtp_password(*env_keys: str) -> str:
    """The SMTP password, cleaned up before it goes over the wire.

    Google shows an app password as four groups of four ("abcd efgh ijkl mnop")
    and it gets pasted into .env exactly like that. SMTP AUTH sends the string
    verbatim, so those spaces make Gmail answer

        535 5.7.8 Username and Password not accepted ... BadCredentials

    even though the password is correct. Strip the spaces (and any quotes the
    value was wrapped in) so either form works.

    Pass the env var names to read, most specific first; defaults to
    SMTP_PASSWORD then COMPANY_EMAIL_PASSWORD.
    """
    for key in env_keys or ("SMTP_PASSWORD", "COMPANY_EMAIL_PASSWORD"):
        raw = os.getenv(key)
        if raw:
            cleaned = raw.strip().strip('"').strip("'")
            # kill every kind of space the copy-paste can bring along
            return "".join(cleaned.split())
    return ""

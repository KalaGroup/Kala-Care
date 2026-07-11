import pyodbc
import logging
import re
from typing import Any, Dict
from app import config

# SQLAlchemy (for auto table creation + sessions)
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from urllib.parse import quote_plus

# ---------------- BUILD DATABASE URL ---------------- #

params = quote_plus(
    f"DRIVER={config.DB_CONFIG['driver']};"
    f"SERVER={config.DB_CONFIG['server']};"
    f"DATABASE={config.DB_CONFIG['database']};"
    f"UID={config.DB_CONFIG['username']};"
    f"PWD={config.DB_CONFIG['password']};"
    "TrustServerCertificate=yes;"
)

DATABASE_URL = f"mssql+pyodbc:///?odbc_connect={params}"

# ---------------- SQLAlchemy SETUP ---------------- #

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False,
    # Keep more warm connections available so concurrent page loads don't
    # queue waiting for a connection (defaults are 5/10).
    pool_size=10,
    max_overflow=20,
    # pyodbc batches multi-row INSERTs into a single round-trip — makes the
    # Excel import endpoints dramatically faster with identical results.
    fast_executemany=True,
)

Base = declarative_base()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# ---------------- IST STORAGE STANDARD ---------------- #
# All timestamps are stored as NAIVE IST. The frontend sends UTC ISO strings
# ("...Z"), which Pydantic parses into timezone-aware datetimes — this hook
# converts every aware datetime on any ORM object to naive IST right before
# it is written, so no controller has to remember the conversion.

import struct
from datetime import datetime as _datetime
from sqlalchemy import event as _event
from sqlalchemy.orm import Session as _Session
from app.time_utils import IST as _IST

# READ side: DATETIMEOFFSET columns (models using DateTime(timezone=True))
# hold IST wall-clock but are tagged +00:00 (GETDATE()/now_ist into a
# tz-aware column). Left as-is, every API response serializes them as
# "...+00:00" and the frontend shifts the time by +5:30 AGAIN.
# This pyodbc output converter makes EVERY read — ORM and raw SQL — return
# the plain wall-clock as a naive datetime, dropping the meaningless offset.
_SQL_SS_TIMESTAMPOFFSET = -155


def _handle_datetimeoffset(dto_value):
    # year, month, day, hour, minute, second, fraction(ns), tz_hour, tz_minute
    tup = struct.unpack("<6hI2h", dto_value)
    return _datetime(tup[0], tup[1], tup[2], tup[3], tup[4], tup[5], tup[6] // 1000)


def _register_datetimeoffset_converter(dbapi_conn):
    try:
        dbapi_conn.add_output_converter(_SQL_SS_TIMESTAMPOFFSET, _handle_datetimeoffset)
    except Exception:
        pass  # older pyodbc without converter support — keep default behavior


@_event.listens_for(engine, "connect")
def _on_engine_connect(dbapi_conn, connection_record):
    _register_datetimeoffset_converter(dbapi_conn)


@_event.listens_for(_Session, "before_flush")
def _store_datetimes_as_naive_ist(session, flush_context, instances):
    for obj in list(session.new) + list(session.dirty):
        mapper = getattr(obj, "__mapper__", None)
        if mapper is None:
            continue
        for attr in mapper.column_attrs:
            val = getattr(obj, attr.key, None)
            if isinstance(val, _datetime) and val.tzinfo is not None:
                setattr(obj, attr.key, val.astimezone(_IST).replace(tzinfo=None))

# ---------------- LOGGING ---------------- #

logging.basicConfig(level=logging.INFO)

security_logger = logging.getLogger("sql_security")
security_logger.setLevel(logging.WARNING)

file_handler = logging.FileHandler("sql_injection_attempts.log")
file_handler.setFormatter(
    logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
)
security_logger.addHandler(file_handler)

# ---------------- CONNECTION FUNCTION (pyodbc) ---------------- #

def get_db_connection():
    conn = pyodbc.connect(
        f"DRIVER={{{config.DB_CONFIG['driver']}}};"
        f"SERVER={config.DB_CONFIG['server']};"
        f"DATABASE={config.DB_CONFIG['database']};"
        f"UID={config.DB_CONFIG['username']};"
        f"PWD={config.DB_CONFIG['password']};"
        "TrustServerCertificate=yes;"
    )
    # Same naive-wall-clock handling as the SQLAlchemy engine (see below)
    _register_datetimeoffset_converter(conn)
    return conn

# ---------------- SQL INJECTION PROTECTION ---------------- #

DANGEROUS_PATTERNS = [
    (r"\bDROP\s+TABLE\b", "DROP TABLE"),
    (r"\bDROP\s+DATABASE\b", "DROP DATABASE"),
    (r"\bTRUNCATE\s+TABLE\b", "TRUNCATE TABLE"),
    (r"\bDELETE\s+FROM\b(?!.*WHERE)", "DELETE without WHERE"),
    (r"\bALTER\s+TABLE\b", "ALTER TABLE"),
    (r"\bGRANT\s+.*?\bTO\b", "GRANT privilege"),
    (r"\bREVOKE\b", "REVOKE privilege"),
    (r"\bCREATE\s+USER\b", "CREATE USER"),
    (r"\bINTO\s+OUTFILE\b", "FILE WRITE"),
    (r"\bLOAD_FILE\s*\(", "FILE READ"),
    (r"\bxp_cmdshell\b", "Command execution"),
    (r"\bxp_\w+\b", "Extended procedure"),
    (r"\bUNION\s+SELECT\b", "UNION injection"),
    (r"\bSLEEP\s*\(", "SLEEP"),
    (r"\bWAITFOR\s+DELAY\b", "WAITFOR DELAY"),
    (r";\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)", "Multiple statements"),
]

def check_sql_injection(query: str):
    for pattern, message in DANGEROUS_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            security_logger.error(f"{message} detected: {query[:300]}")
            raise Exception(f"Blocked dangerous SQL: {message}")

# ---------------- EXECUTE SAFE QUERY ---------------- #

def execute_safe_query(query: str, params: tuple = None):
    check_sql_injection(query)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if params:
            cursor.execute(query, params)
        else:
            raise Exception("Raw queries without parameters are not allowed")

        conn.commit()
        return cursor.fetchall()

    except Exception as e:
        security_logger.error(f"Database error: {e}")
        raise

    finally:
        if conn:
            conn.close()

# ---------------- TEST CONNECTION ---------------- #

def test_connection():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
        return True
    except Exception as e:
        print("DB Connection Error:", e)
        return False


print("✅ PyODBC + SQLAlchemy initialized")
print("✅ SQL Injection Protection ENABLED")
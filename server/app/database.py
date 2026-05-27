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
    echo=False
)

Base = declarative_base()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

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
    return pyodbc.connect(
        f"DRIVER={{{config.DB_CONFIG['driver']}}};"
        f"SERVER={config.DB_CONFIG['server']};"
        f"DATABASE={config.DB_CONFIG['database']};"
        f"UID={config.DB_CONFIG['username']};"
        f"PWD={config.DB_CONFIG['password']};"
        "TrustServerCertificate=yes;"
    )

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
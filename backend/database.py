"""
Database connection management for Oracle database.
"""
import oracledb
from contextlib import contextmanager
from typing import Optional, Generator
from .config import config


class DatabaseConnection:
    """Manages Oracle database connections and operations."""

    def __init__(self):
        self.pool: Optional[oracledb.ConnectionPool] = None
        self._init_pool()

    def _init_pool(self):
        """Initialize connection pool."""
        try:
            # Configure Oracle client if needed (skip if credentials not provided)
            if not all([config.oracle_user, config.oracle_password, config.oracle_dsn]):
                print("Oracle credentials not configured - database operations will fail")
                self.pool = None
                return

            # Try to initialize Oracle client (may not be needed in all environments)
            #try:
            #    oracledb.init_oracle_client()
            #except Exception as e:
            #    print(f"Oracle client initialization warning: {e}")

            self.pool = oracledb.create_pool(
                user=config.oracle_user,
                password=config.oracle_password,
                dsn=config.oracle_dsn,
                config_dir=config.oracle_wallet,
                wallet_location=config.oracle_wallet,
                wallet_password=config.oracle_wallet_pass,
                min=2,
                max=10,
                increment=1,
                getmode=oracledb.POOL_GETMODE_WAIT,
                timeout=30,
            )
            print("Oracle connection pool initialized successfully")
        except Exception as e:
            print(f"Failed to initialize Oracle connection pool: {e}")
            self.pool = None

    @contextmanager
    def get_connection(self) -> Generator[oracledb.Connection, None, None]:
        """Get a database connection from the pool."""
        if self.pool is None:
            raise Exception("Database connection pool not initialized")

        connection = None
        try:
            connection = self.pool.acquire()
            yield connection
        finally:
            if connection:
                self.pool.release(connection)

    def execute_query(self, query: str, params: Optional[tuple | dict] = None, fetch: bool = True):
        """Execute a SELECT query and return results."""
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params or ())
                if fetch:
                    return cursor.fetchall()
                return None

    def execute_dml(self, query: str, params: Optional[tuple | dict] = None) -> int:
        """Execute INSERT, UPDATE, DELETE queries."""
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params or ())
                conn.commit()
                return cursor.rowcount

    def test_connection(self) -> bool:
        """Test database connection."""
        try:
            result = self.execute_query("SELECT 1 FROM DUAL")
            return result is not None and len(result) > 0
        except Exception as e:
            print(f"Database connection test failed: {e}")
            return False


# Global database instance
db = DatabaseConnection()

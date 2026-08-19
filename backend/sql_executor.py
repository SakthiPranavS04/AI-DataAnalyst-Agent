from sqlalchemy import text
from .database import engine

class SQLExecutionError(Exception):
    pass

def execute_sql_safely(sql: str, row_limit: int = 100) -> tuple[list[dict], list[str]]:
    """
    Executes a read-only SQL query safely.
    Returns a tuple of (rows, column_names).
    """
    try:
        # Wrap query in a transaction that is rolled back or just rely on autocommit=False
        # Since it's read only, simple execution is fine, but we enforce limit.
        with engine.connect() as conn:
            # We enforce read-only at connection level if possible, but validator handles syntax.
            # Timeout can be set at statement level using dialect specific options if needed.
            # For Postgres, we can do SET statement_timeout = '10s'
            conn.execute(text("SET statement_timeout = '10s'"))
            
            # Ensure query has limit if not present, but simple way is just fetchmany
            result = conn.execute(text(sql))
            
            columns = list(result.keys())
            rows = []
            
            for row in result.fetchmany(row_limit):
                rows.append(dict(zip(columns, row)))
                
            return rows, columns
            
    except Exception as e:
        raise SQLExecutionError(f"Database execution failed: {str(e)}")

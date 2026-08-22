import sqlglot
from sqlglot import exp

class SQLValidationError(Exception):
    pass

def validate_sql(sql: str) -> str:
    """
    Parses and validates the SQL. 
    Returns the parsed SQL string if valid, otherwise raises SQLValidationError.
    Only allows read-only (SELECT) statements.
    """
    if not sql or not sql.strip():
        raise SQLValidationError("SQL query is empty or None.")
    try:
        # We parse the sql into a list of expressions
        parsed_statements = sqlglot.parse(sql, read="postgres")
    except sqlglot.errors.ParseError as e:
        raise SQLValidationError(f"SQL parsing error: {str(e)}")

    if not parsed_statements:
        raise SQLValidationError("No SQL statement found.")
    
    if len(parsed_statements) > 1:
        raise SQLValidationError("Multiple statements are not allowed. Please provide a single SELECT statement.")
        
    statement = parsed_statements[0]
    
    if not isinstance(statement, exp.Select):
        # Allow Union (which inherits from Select or can be represented differently, but usually safe)
        if not isinstance(statement, exp.Union):
            raise SQLValidationError(f"Only SELECT statements are allowed. Found: {type(statement).__name__}")
            
    # Additional checks could be placed here to prevent malicious functions if needed.
    
    return statement.sql(dialect="postgres")

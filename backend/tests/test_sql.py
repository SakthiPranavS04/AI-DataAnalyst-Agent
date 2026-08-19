import pytest
from backend.sql_validator import validate_sql, SQLValidationError

def test_valid_select():
    sql = "SELECT * FROM customers LIMIT 10;"
    valid_sql = validate_sql(sql)
    assert "SELECT" in valid_sql.upper()

def test_reject_drop():
    sql = "DROP TABLE customers;"
    with pytest.raises(SQLValidationError):
        validate_sql(sql)

def test_reject_delete():
    sql = "DELETE FROM customers WHERE id = 1;"
    with pytest.raises(SQLValidationError):
        validate_sql(sql)

def test_reject_update():
    sql = "UPDATE customers SET name = 'test';"
    with pytest.raises(SQLValidationError):
        validate_sql(sql)

def test_reject_insert():
    sql = "INSERT INTO customers (name) VALUES ('test');"
    with pytest.raises(SQLValidationError):
        validate_sql(sql)

def test_reject_multiple_statements():
    sql = "SELECT * FROM customers; DROP TABLE orders;"
    with pytest.raises(SQLValidationError):
        validate_sql(sql)

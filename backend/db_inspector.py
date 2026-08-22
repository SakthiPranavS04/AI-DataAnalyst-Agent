from sqlalchemy import inspect
from database import engine

def get_database_schema() -> str:
    """
    Inspects the database and returns a string representation of the schema.
    This includes table names, columns, data types, primary keys, and foreign keys.
    """
    inspector = inspect(engine)
    schema_details = []
    
    for table_name in inspector.get_table_names():
        schema_details.append(f"Table: {table_name}")
        
        # Columns
        columns = inspector.get_columns(table_name)
        pk = inspector.get_pk_constraint(table_name)
        pk_cols = pk.get('constrained_columns', []) if pk else []
        
        for col in columns:
            col_name = col['name']
            col_type = col['type']
            pk_str = " (PRIMARY KEY)" if col_name in pk_cols else ""
            schema_details.append(f"  - {col_name}: {col_type}{pk_str}")
            
        # Foreign Keys
        fks = inspector.get_foreign_keys(table_name)
        for fk in fks:
            constrained_cols = ", ".join(fk['constrained_columns'])
            referred_table = fk['referred_table']
            referred_cols = ", ".join(fk['referred_columns'])
            schema_details.append(f"  * Foreign Key: {constrained_cols} -> {referred_table}({referred_cols})")
            
        schema_details.append("") # Empty line for readability
        
    return "\n".join(schema_details)

def get_structured_schema() -> list:
    """
    Inspects the database and returns a list of dictionaries containing structured table schemas.
    """
    inspector = inspect(engine)
    schema = []
    
    for table_name in inspector.get_table_names():
        table_data = {
            "name": table_name,
            "columns": [],
            "foreign_keys": []
        }
        
        # Columns
        columns = inspector.get_columns(table_name)
        pk = inspector.get_pk_constraint(table_name)
        pk_cols = pk.get('constrained_columns', []) if pk else []
        
        for col in columns:
            col_name = col['name']
            col_type = str(col['type'])
            table_data["columns"].append({
                "name": col_name,
                "type": col_type,
                "is_pk": col_name in pk_cols
            })
            
        # Foreign Keys
        fks = inspector.get_foreign_keys(table_name)
        for fk in fks:
            table_data["foreign_keys"].append({
                "constrained_columns": fk['constrained_columns'],
                "referred_table": fk['referred_table'],
                "referred_columns": fk['referred_columns']
            })
            
        schema.append(table_data)
        
    return schema


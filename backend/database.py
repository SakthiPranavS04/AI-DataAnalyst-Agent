import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ai_analyst")

# Helper to auto-seed SQLite database
def bootstrap_sqlite(engine_instance):
    inspector = inspect(engine_instance)
    
    needs_bootstrap = False
    if 'customers' not in inspector.get_table_names():
        needs_bootstrap = True
    else:
        # Check if table DDL is using SERIAL type (corrupted sqlite initialization)
        try:
            with engine_instance.connect() as conn:
                res = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='customers'"))
                row = res.fetchone()
                if row and 'SERIAL' in row[0].upper():
                    needs_bootstrap = True
        except Exception:
            needs_bootstrap = True
            
    if needs_bootstrap:
        print("SQLite database needs bootstrapping. Initializing database from db/init.sql...")
        try:
            # Drop existing tables to ensure clean state
            with engine_instance.connect() as conn:
                conn.execute(text("PRAGMA foreign_keys = OFF;"))
                for table_name in inspector.get_table_names():
                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name};"))
                conn.execute(text("PRAGMA foreign_keys = ON;"))
                conn.commit()
        except Exception as e:
            print(f"Error dropping existing SQLite tables: {e}")

        try:
            # Locate db/init.sql relative to workspace root
            init_sql_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'db', 'init.sql')
            if os.path.exists(init_sql_path):
                with open(init_sql_path, 'r', encoding='utf-8') as f:
                    sql_statements = f.read()
                
                # Convert Postgres SERIAL PRIMARY KEY to SQLite AUTOINCREMENT
                sql_statements = sql_statements.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
                
                with engine_instance.connect() as conn:
                    # In SQLite we can execute multiple statements by running executescript on the raw connection
                    raw_conn = conn.connection
                    cursor = raw_conn.cursor()
                    cursor.executescript(sql_statements)
                    raw_conn.commit()
                print("SQLite database successfully bootstrapped and seeded.")
            else:
                print(f"Warning: init.sql not found at {init_sql_path}. Skipping bootstrapping.")
        except Exception as e:
            print(f"Error bootstrapping SQLite database: {e}")

try:
    # Test connection to the primary database
    engine = create_engine(DATABASE_URL)
    # Attempt to connect to check if it's available
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print(f"Connected to primary database successfully: {DATABASE_URL}")
except Exception as e:
    # If connection fails and it was a Postgres DB, fallback to SQLite
    if "postgresql" in DATABASE_URL:
        print(f"PostgreSQL connection failed ({e}). Falling back to local SQLite database.")
        DATABASE_URL = "sqlite:///./ai_analyst.db"
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
        bootstrap_sqlite(engine)
    else:
        # Re-raise if SQLite or other connection fails
        raise e

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

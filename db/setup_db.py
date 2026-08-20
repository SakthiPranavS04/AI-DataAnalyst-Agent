import os
import sys
import subprocess
import urllib.request
import zipfile
import time
import socket

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PG_DIR = os.path.join(ROOT_DIR, "pgsql")
PG_DATA = os.path.join(ROOT_DIR, "pgdata")
ZIP_PATH = os.path.join(ROOT_DIR, "postgresql.zip")
ZIP_URL = "https://get.enterprisedb.com/postgresql/postgresql-15.0-1-windows-x64-binaries.zip"

def check_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def run_cmd(args, shell=False):
    print(f"Running command: {' '.join(args) if isinstance(args, list) else args}")
    result = subprocess.run(args, shell=shell, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Command failed with code {result.returncode}")
        print(f"Stdout:\n{result.stdout}")
        print(f"Stderr:\n{result.stderr}")
    return result

def main():
    # 1. Check if PostgreSQL already running
    if check_port_open(5432):
        print("Something is already listening on port 5432. Assuming PostgreSQL is running.")
    else:
        # 2. Download ZIP
        if not os.path.exists(PG_DIR):
            if not os.path.exists(ZIP_PATH):
                print(f"Downloading PostgreSQL binary ZIP from {ZIP_URL}...")
                urllib.request.urlretrieve(ZIP_URL, ZIP_PATH)
                print("Download complete.")
            
            # 3. Extract ZIP
            print(f"Extracting PostgreSQL to {PG_DIR}...")
            with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
                zip_ref.extractall(ROOT_DIR)
            print("Extraction complete.")
            
            # Clean up ZIP
            try:
                os.remove(ZIP_PATH)
            except Exception as e:
                print(f"Error removing ZIP file: {e}")

        # 4. Initialize Database cluster
        initdb_path = os.path.join(PG_DIR, "bin", "initdb.exe")
        if not os.path.exists(PG_DATA):
            print(f"Initializing database cluster at {PG_DATA}...")
            run_cmd([initdb_path, "-D", PG_DATA, "-U", "postgres", "--auth-local=trust", "--auth-host=trust"])
        
        # 5. Start PostgreSQL Server
        pg_ctl_path = os.path.join(PG_DIR, "bin", "pg_ctl.exe")
        print("Starting PostgreSQL server...")
        run_cmd([pg_ctl_path, "-D", PG_DATA, "-l", os.path.join(ROOT_DIR, "pg_log.txt"), "start"])
        
        # Wait for PostgreSQL to start
        print("Waiting for PostgreSQL port 5432 to open...")
        retries = 15
        while retries > 0:
            if check_port_open(5432):
                print("PostgreSQL started successfully.")
                break
            time.sleep(1)
            retries -= 1
        else:
            print("Failed to start PostgreSQL server or port is blocked.")
            sys.exit(1)

    # 6. Set password for user postgres to 'postgres_password'
    psql_path = os.path.join(PG_DIR, "bin", "psql.exe")
    print("Configuring postgres user password...")
    run_cmd([psql_path, "-U", "postgres", "-d", "postgres", "-c", "ALTER USER postgres WITH PASSWORD 'postgres_password';"])

    # 7. Create database 'sqlanalyst' if it doesn't exist
    print("Creating database 'sqlanalyst'...")
    check_db_cmd = [psql_path, "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", "SELECT 1 FROM pg_database WHERE datname='sqlanalyst'"]
    db_exists_res = run_cmd(check_db_cmd)
    if "1" not in db_exists_res.stdout:
        run_cmd([psql_path, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE sqlanalyst;"])
        print("Database 'sqlanalyst' created.")
    else:
        print("Database 'sqlanalyst' already exists.")

    # 8. Seed the database with 'db/init.sql'
    init_sql_path = os.path.join(ROOT_DIR, "db", "init.sql")
    print(f"Seeding database from {init_sql_path}...")
    run_cmd([psql_path, "-U", "postgres", "-d", "sqlanalyst", "-f", init_sql_path])
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    main()

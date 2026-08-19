# AI SQL Data Analyst Agent

An intelligent, full-stack application that acts as a Data Analyst. It allows users to ask natural-language questions about a PostgreSQL business database. The application uses a LangGraph-powered AI Agent to understand the question, inspect the database schema, generate SQL, validate it, execute the safe query, and return natural-language insights along with tables and charts.

## Problem Statement

Business users often lack SQL expertise to query their own databases. Writing custom dashboards is time-consuming and rigid. This project provides a conversational interface where an AI dynamically translates business questions into safe, executable SQL and visualizes the results.

## Architecture & Data Flow

1. **User Question**: The user asks a question in the React UI (e.g., "What are the top 5 products by revenue?").
2. **FastAPI Backend**: The request is sent to the FastAPI backend and passed to the LangGraph Agent.
3. **Agent Workflow (LangGraph)**:
    - **Understand Question**: Initializes context.
    - **Inspect Schema**: Reads table names, columns, and foreign keys from PostgreSQL.
    - **Generate SQL**: The LLM writes a PostgreSQL query using the schema.
    - **Validate SQL**: `sqlglot` parses the SQL, ensuring it is a read-only `SELECT` statement (rejects DROP, DELETE, etc).
    - **Execute SQL**: Runs the query safely against the database with a limit.
    - **Analyze Result**: Evaluates the retrieved rows to summarize findings and decide on visualization.
    - **Prepare Chart**: Structures the data for Recharts (bar, line, pie) if applicable.
    - **Generate Answer**: The LLM crafts a natural language response.
4. **React UI**: Renders the answer, agent activity, generated SQL, results table, and charts.

## Technology Stack

* **Frontend**: React.js, Vite, Tailwind CSS, Recharts, Lucide Icons
* **Backend**: FastAPI, LangChain, LangGraph, sqlglot, SQLAlchemy
* **Database**: PostgreSQL
* **LLM**: Configurable for Ollama (local) or OpenAI-compatible endpoints
* **Infrastructure**: Docker, Docker Compose

## Folder Structure

```
├── backend/
│   ├── agent.py            # LangGraph agent definitions
│   ├── database.py         # SQLAlchemy DB connection
│   ├── db_inspector.py     # Schema inspection tool
│   ├── main.py             # FastAPI entrypoint
│   ├── sql_executor.py     # Safe SQL execution
│   ├── sql_validator.py    # SQLGlot AST validation
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Main React Chat Interface
│   │   ├── index.css       # Tailwind entry
│   │   └── main.jsx        # React entrypoint
│   └── package.json
├── db/
│   └── init.sql            # PostgreSQL schema and seed data
├── docker-compose.yml
└── README.md
```

## Security & Error Handling

- **SQL Validation**: Queries are parsed into Abstract Syntax Trees (ASTs) using `sqlglot` to verify they are exclusively `SELECT` statements.
- **Error Handling**: The LangGraph agent catches execution or syntax errors and will ask the LLM to rewrite and retry the query.
- **Secrets Management**: No secrets are committed. Database credentials and API keys are injected via environment variables.

## Installation & Local Development

### Prerequisites
- Docker and Docker Compose
- (Optional) Node.js and Python 3.11 for manual local development outside Docker.

### 1. Environment Setup

Copy the example environment file and configure it:
```bash
cp .env.example .env
```
Edit `.env` to include your `OPENAI_API_KEY` (if using OpenAI) or configure `OLLAMA_BASE_URL` if using a local/cloud Ollama instance.

### 2. Run with Docker Compose

Start the entire stack (Database, Backend, Frontend):
```bash
docker compose up --build
```

### 3. Access the Application

- **Frontend UI**: http://localhost:5173
- **Backend API Docs**: http://localhost:8000/docs
- **Database**: `localhost:5432`

## Example Questions to Try

1. How many customers do we have?
2. What is the total revenue?
3. Which product generated the highest revenue?
4. Show monthly revenue as a line chart.
5. Show the top 10 products as a bar chart.
6. What percentage of revenue came from the top 5 products?

## Testing

Run backend tests using `pytest` inside the backend directory:
```bash
cd backend
pip install -r requirements.txt
pytest tests/
```

## Future Enhancements
- Expand schema context to include table descriptions via LLM-generated metadata.
- Implement more complex multi-step analytical reasoning (e.g., Python REPL for advanced math).
- Support for different dialects (MySQL, Snowflake).

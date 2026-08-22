from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from database import get_db
from sqlalchemy.orm import Session
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI SQL DataAnalyst Agent")

cors_origins_str = os.getenv("BACKEND_CORS_ORIGINS", '["*"]')
try:
    origins = json.loads(cors_origins_str)
except Exception:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str
    session_id: Optional[str] = None

class ChartData(BaseModel):
    type: str
    data: List[Dict[str, Any]]

class QueryResponse(BaseModel):
    question: str
    answer: str
    sql: str
    rows: List[Dict[str, Any]]
    columns: List[str]
    chart: Optional[ChartData] = None
    agent_steps: List[str]
    error: Optional[str] = None

@app.get("/health")
def health_check():
    return {"status": "ok"}

from agent import app_graph, AgentState, LLMServiceError
import uuid

@app.post("/api/query", response_model=QueryResponse)
def run_query(request: QueryRequest, db: Session = Depends(get_db)):
    try:
        initial_state = {
            "user_question": request.question,
            "conversation_history": [],
            "schema": "",
            "generated_sql": "",
            "validation_result": "",
            "query_result": [],
            "columns": [],
            "error": "",
            "analysis": "",
            "chart_data": {},
            "chart_type": "none",
            "final_answer": "",
            "agent_steps": [],
            "retries": 0
        }
        
        config = {"configurable": {"thread_id": request.session_id or str(uuid.uuid4())}}
        result_state = app_graph.invoke(initial_state, config=config)
        
        return QueryResponse(
            question=request.question,
            answer=result_state.get("final_answer", ""),
            sql=result_state.get("generated_sql", ""),
            rows=result_state.get("query_result", []),
            columns=result_state.get("columns", []),
            chart=result_state.get("chart_data") if result_state.get("chart_type") != "none" else None,
            agent_steps=result_state.get("agent_steps", []),
            error=result_state.get("error") if result_state.get("error") else None
        )
    except LLMServiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if "psycopg2" in err_msg or "sqlalchemy" in err_msg or "connection" in err_msg.lower():
            raise HTTPException(status_code=503, detail=f"Unable to connect to the database. Details: {err_msg}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err_msg}")

@app.post("/api/chat")
def chat(request: QueryRequest, db: Session = Depends(get_db)):
    # Equivalent to query for now. In a real system, you'd load history from a DB based on session_id
    return run_query(request, db)

@app.get("/api/schema")
def get_schema():
    from db_inspector import get_structured_schema
    try:
        return get_structured_schema()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch schema: {str(e)}")


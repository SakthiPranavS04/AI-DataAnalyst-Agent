import os
import json
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AnyMessage
from pydantic import BaseModel, Field

from .db_inspector import get_database_schema
from .sql_validator import validate_sql, SQLValidationError
from .sql_executor import execute_sql_safely, SQLExecutionError

# Setup LLM - can be configured for OpenAI or local Ollama with OpenAI compatible endpoint
# By default we can use ChatOpenAI pointing to the Ollama endpoint if defined, otherwise standard OpenAI
if os.getenv("OLLAMA_BASE_URL"):
    llm = ChatOpenAI(
        model=os.getenv("OLLAMA_MODEL", "gpt-oss:20b-cloud"),
        base_url=f"{os.getenv('OLLAMA_BASE_URL')}/v1",
        api_key="ollama" # api key isn't needed for local ollama but required by client
    )
else:
    llm = ChatOpenAI(
        model="gpt-3.5-turbo", # fallback
        api_key=os.getenv("OPENAI_API_KEY", "dummy")
    )

class AgentState(TypedDict):
    user_question: str
    conversation_history: List[Dict[str, str]]
    schema: str
    generated_sql: str
    validation_result: str
    query_result: List[Dict[str, Any]]
    columns: List[str]
    error: str
    analysis: str
    chart_data: Dict[str, Any]
    chart_type: str
    final_answer: str
    agent_steps: List[str]
    retries: int

def add_step(state: AgentState, step: str) -> None:
    if "agent_steps" not in state or state["agent_steps"] is None:
        state["agent_steps"] = []
    state["agent_steps"].append(step)

def understand_question(state: AgentState) -> AgentState:
    add_step(state, "Understanding question")
    return state

def inspect_schema(state: AgentState) -> AgentState:
    add_step(state, "Inspecting database schema")
    schema_str = get_database_schema()
    return {"schema": schema_str}

class SQLGenerationOutput(BaseModel):
    sql: str = Field(description="The PostgreSQL query to answer the question")

def generate_sql(state: AgentState) -> AgentState:
    add_step(state, "Generating SQL")
    
    # Also append the current question to history
    state.get("conversation_history", []).append({"role": "user", "content": state['user_question']})
    
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in state.get("conversation_history", [])[-5:]]) # Last 5 turns
    
    error_context = ""
    if state.get("error"):
        error_context = f"\n\nPrevious attempt failed with error:\n{state['error']}\nPlease correct the SQL."
        
    prompt = f"""
    You are an expert PostgreSQL Data Analyst.
    Your task is to generate a read-only SQL query to answer the user's question.
    
    Rules:
    - Use ONLY the provided schema. Do NOT invent tables or columns.
    - Generate PostgreSQL-compatible SQL.
    - NEVER modify database data (NO INSERT, UPDATE, DELETE, DROP, etc).
    - Return ONLY read-only queries (SELECT).
    - Use correct joins.
    - Avoid unnecessary columns, use aggregation when appropriate.
    - Use aliases for calculated fields.
    - Apply sensible LIMIT values (e.g., LIMIT 100).
    - Answer date/time questions appropriately based on timestamps.
    
    Schema:
    {state.get("schema", "")}
    
    Conversation History:
    {history_text}
    
    User Question: {state['user_question']}
    {error_context}
    """
    
    # We use structured output if supported, or just ask it to return raw sql.
    # To be safe across models (like standard llama3 via ollama which might struggle with function calling),
    # we'll ask for raw sql in markdown block and extract it, or use structured output if using a good model.
    structured_llm = llm.with_structured_output(SQLGenerationOutput)
    
    try:
        result = structured_llm.invoke([SystemMessage(content=prompt)])
        sql = result.sql
    except Exception as e:
        # Fallback to normal parsing if structured output fails
        response = llm.invoke([SystemMessage(content=prompt)])
        content = response.content
        # Extract from markdown if present
        if "```sql" in content:
            sql = content.split("```sql")[1].split("```")[0].strip()
        elif "```" in content:
            sql = content.split("```")[1].strip()
        else:
            sql = content.strip()
            
    # Clean up backticks if any
    sql = sql.replace("`", "")
            
    return {"generated_sql": sql, "error": ""}

def validate_sql_node(state: AgentState) -> AgentState:
    add_step(state, "Validating SQL")
    sql = state.get("generated_sql", "")
    try:
        valid_sql = validate_sql(sql)
        return {"generated_sql": valid_sql, "validation_result": "SUCCESS", "error": ""}
    except SQLValidationError as e:
        return {"validation_result": "FAILURE", "error": str(e), "retries": state.get("retries", 0) + 1}

def execute_sql(state: AgentState) -> AgentState:
    add_step(state, "Executing query")
    sql = state.get("generated_sql", "")
    try:
        rows, columns = execute_sql_safely(sql)
        return {"query_result": rows, "columns": columns, "error": ""}
    except SQLExecutionError as e:
        return {"error": str(e), "retries": state.get("retries", 0) + 1}

def analyze_result(state: AgentState) -> AgentState:
    add_step(state, "Analyzing result")
    
    # We can ask the LLM if visualization is needed, or just decide based on row count and types.
    rows = state.get("query_result", [])
    
    if len(rows) == 0:
        return {"analysis": "No data found.", "chart_type": "none"}
        
    prompt = f"""
    Analyze the following query results based on the user's question: '{state['user_question']}'.
    Provide a brief summary of the findings. Also determine if these results should be visualized.
    Valid chart types: "bar", "line", "pie", or "none".
    
    Results (up to 10 rows shown):
    {json.dumps(rows[:10], default=str)}
    
    Respond in JSON format with keys:
    "summary": "your brief summary",
    "chart_type": "bar/line/pie/none"
    """
    
    try:
        response = llm.invoke([SystemMessage(content=prompt)])
        # simple json extraction
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1]
            
        data = json.loads(content.strip())
        return {"analysis": data.get("summary", ""), "chart_type": data.get("chart_type", "none")}
    except Exception as e:
        return {"analysis": "Data retrieved successfully.", "chart_type": "none"}

def prepare_chart(state: AgentState) -> AgentState:
    add_step(state, "Preparing visualization")
    chart_type = state.get("chart_type", "none")
    rows = state.get("query_result", [])
    columns = state.get("columns", [])
    
    if chart_type == "none" or len(rows) == 0 or len(columns) < 2:
        return {"chart_data": None}
        
    # We'll just pass the rows directly as chart data, but React needs to know which keys to use
    # typically x-axis is the first column, y-axis is the second.
    chart_data = {
        "type": chart_type,
        "data": rows,
        "xAxis": columns[0],
        "yAxis": columns[1]
    }
    
    return {"chart_data": chart_data}

def generate_final_answer(state: AgentState) -> AgentState:
    add_step(state, "Generating answer")
    
    if state.get("error") and state.get("retries", 0) >= 3:
        return {"final_answer": f"I couldn't answer the question due to an error: {state['error']}"}
        
    prompt = f"""
    You are an AI SQL Data Analyst.
    User Question: {state['user_question']}
    
    Database Query Analysis: {state.get("analysis", "No analysis available.")}
    
    Formulate a concise, final natural language answer to the user.
    Do not mention the SQL unless relevant. Answer the question directly using the data.
    If no data was found, state that clearly.
    """
    
    response = llm.invoke([SystemMessage(content=prompt)])
    
    state.get("conversation_history", []).append({"role": "assistant", "content": response.content})
    
    return {"final_answer": response.content, "conversation_history": state.get("conversation_history", [])}

# Conditional edges
def check_validation(state: AgentState) -> str:
    if state.get("validation_result") == "FAILURE":
        if state.get("retries", 0) >= 3:
            return "generate_final_answer"
        return "generate_sql"
    return "execute_sql"

def check_execution(state: AgentState) -> str:
    if state.get("error"):
        if state.get("retries", 0) >= 3:
            return "generate_final_answer"
        return "generate_sql"
    return "analyze_result"

def check_chart_needed(state: AgentState) -> str:
    if state.get("chart_type") in ["bar", "line", "pie"]:
        return "prepare_chart"
    return "generate_final_answer"

from langgraph.checkpoint.memory import MemorySaver

# Build Graph
workflow = StateGraph(AgentState)

workflow.add_node("understand_question", understand_question)
workflow.add_node("inspect_schema", inspect_schema)
workflow.add_node("generate_sql", generate_sql)
workflow.add_node("validate_sql", validate_sql_node)
workflow.add_node("execute_sql", execute_sql)
workflow.add_node("analyze_result", analyze_result)
workflow.add_node("prepare_chart", prepare_chart)
workflow.add_node("generate_final_answer", generate_final_answer)

workflow.set_entry_point("understand_question")
workflow.add_edge("understand_question", "inspect_schema")
workflow.add_edge("inspect_schema", "generate_sql")
workflow.add_edge("generate_sql", "validate_sql")

workflow.add_conditional_edges(
    "validate_sql",
    check_validation,
    {
        "generate_sql": "generate_sql",
        "execute_sql": "execute_sql",
        "generate_final_answer": "generate_final_answer"
    }
)

workflow.add_conditional_edges(
    "execute_sql",
    check_execution,
    {
        "generate_sql": "generate_sql",
        "analyze_result": "analyze_result",
        "generate_final_answer": "generate_final_answer"
    }
)

workflow.add_conditional_edges(
    "analyze_result",
    check_chart_needed,
    {
        "prepare_chart": "prepare_chart",
        "generate_final_answer": "generate_final_answer"
    }
)

workflow.add_edge("prepare_chart", "generate_final_answer")
workflow.add_edge("generate_final_answer", END)

memory = MemorySaver()
app_graph = workflow.compile(checkpointer=memory)

import { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import {
  Database, Send, Terminal, Activity, Table,
  PieChart as PieChartIcon, ChevronDown, ChevronUp,
  Sun, Moon, Info, Check, Copy, Download, RefreshCw,
  Folder, FolderOpen, Key, ChevronRight, Menu, X, Play
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const QUICK_QUESTIONS = [
  "How many customers do we have?",
  "What is the total revenue?",
  "Which product generated the highest revenue?",
  "Show monthly revenue as a line chart.",
  "Show the top 5 products as a bar chart.",
  "Show payment method popularity as a pie chart."
];

const FALLBACK_SCHEMA = [
  {
    "name": "customers",
    "columns": [
      {"name": "id", "type": "INTEGER", "is_pk": true},
      {"name": "name", "type": "VARCHAR(255)", "is_pk": false},
      {"name": "email", "type": "VARCHAR(255)", "is_pk": false},
      {"name": "city", "type": "VARCHAR(100)", "is_pk": false},
      {"name": "created_at", "type": "TIMESTAMP", "is_pk": false}
    ],
    "foreign_keys": []
  },
  {
    "name": "products",
    "columns": [
      {"name": "id", "type": "INTEGER", "is_pk": true},
      {"name": "name", "type": "VARCHAR(255)", "is_pk": false},
      {"name": "category", "type": "VARCHAR(100)", "is_pk": false},
      {"name": "price", "type": "DECIMAL(10,2)", "is_pk": false},
      {"name": "stock", "type": "INTEGER", "is_pk": false},
      {"name": "created_at", "type": "TIMESTAMP", "is_pk": false}
    ],
    "foreign_keys": []
  },
  {
    "name": "orders",
    "columns": [
      {"name": "id", "type": "INTEGER", "is_pk": true},
      {"name": "customer_id", "type": "INTEGER", "is_pk": false},
      {"name": "order_date", "type": "TIMESTAMP", "is_pk": false},
      {"name": "status", "type": "VARCHAR(50)", "is_pk": false},
      {"name": "total_amount", "type": "DECIMAL(10,2)", "is_pk": false}
    ],
    "foreign_keys": [
      {"constrained_columns": ["customer_id"], "referred_table": "customers", "referred_columns": ["id"]}
    ]
  },
  {
    "name": "order_items",
    "columns": [
      {"name": "id", "type": "INTEGER", "is_pk": true},
      {"name": "order_id", "type": "INTEGER", "is_pk": false},
      {"name": "product_id", "type": "INTEGER", "is_pk": false},
      {"name": "quantity", "type": "INTEGER", "is_pk": false},
      {"name": "unit_price", "type": "DECIMAL(10,2)", "is_pk": false}
    ],
    "foreign_keys": [
      {"constrained_columns": ["order_id"], "referred_table": "orders", "referred_columns": ["id"]},
      {"constrained_columns": ["product_id"], "referred_table": "products", "referred_columns": ["id"]}
    ]
  },
  {
    "name": "payments",
    "columns": [
      {"name": "id", "type": "INTEGER", "is_pk": true},
      {"name": "order_id", "type": "INTEGER", "is_pk": false},
      {"name": "payment_date", "type": "TIMESTAMP", "is_pk": false},
      {"name": "amount", "type": "DECIMAL(10,2)", "is_pk": false},
      {"name": "payment_method", "type": "VARCHAR(50)", "is_pk": false},
      {"name": "status", "type": "VARCHAR(50)", "is_pk": false}
    ],
    "foreign_keys": [
      {"constrained_columns": ["order_id"], "referred_table": "orders", "referred_columns": ["id"]}
    ]
  }
];

// Utility: Format values for currencies and numbers
function formatCellValue(value, colName) {
  if (value === null || value === undefined) return '';
  
  const num = Number(value);
  if (!isNaN(num) && typeof value !== 'boolean' && value !== '') {
    const isMoney = /revenue|sales|price|amount|payment|total|cost|budget|profit/i.test(colName);
    if (isMoney) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    }
    return new Intl.NumberFormat('en-US').format(num);
  }
  return value.toString();
}

// Utility: Detect numeric columns
function isNumericColumn(rows, colName) {
  if (!rows || rows.length === 0) return false;
  const val = rows[0][colName];
  return typeof val === 'number' || (!isNaN(Number(val)) && val !== '' && typeof val !== 'boolean');
}

// Utility: Dynamically classify and select the optimal visualization config
function getVisualizationDetails(rows, columns, backendChart) {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return { type: 'none' };
  }

  // 1. Single metric card detection
  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    const key = Object.keys(rows[0])[0];
    const val = rows[0][key];
    const num = Number(val);
    if (!isNaN(num)) {
      return { type: 'metric', key, value: val };
    }
  }

  const numericColumns = [];
  const timeColumns = [];
  const categoricalColumns = [];
  
  const timeRegex = /^(date|month|year|day|time|created_at|order_date|payment_date)/i;

  columns.forEach(col => {
    let isNumeric = true;
    let isTime = timeRegex.test(col);
    
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const val = rows[i][col];
      if (val === null || val === undefined) continue;
      
      const num = Number(val);
      if (isNaN(num)) {
        isNumeric = false;
      }
      
      if (val instanceof Date || (!isNaN(Date.parse(val)) && typeof val === 'string' && val.length > 5 && (val.includes('-') || val.includes('/')))) {
        isTime = true;
      }
    }
    
    if (isNumeric) {
      numericColumns.push(col);
    } else if (isTime) {
      timeColumns.push(col);
    } else {
      categoricalColumns.push(col);
    }
  });

  let type = backendChart?.type || 'none';
  let xAxis = backendChart?.xAxis || columns[0];
  let yAxis = backendChart?.yAxis || numericColumns[0];

  // Dynamic guessing if none or not set
  if (type === 'none' && numericColumns.length > 0) {
    if (timeColumns.length > 0) {
      type = 'line';
      xAxis = timeColumns[0];
      yAxis = numericColumns[0];
    } else if (categoricalColumns.length > 0) {
      const lowerCat = categoricalColumns[0].toLowerCase();
      if ((lowerCat.includes('share') || lowerCat.includes('percent') || lowerCat.includes('proportion')) && rows.length <= 6) {
        type = 'pie';
      } else {
        type = 'bar';
      }
      xAxis = categoricalColumns[0];
      yAxis = numericColumns[0];
    } else if (columns.length >= 2) {
      type = 'bar';
      xAxis = columns[0];
      yAxis = numericColumns[0];
    }
  }

  // Convert line chart with cumulative volume or sales over time to Area Chart
  if (type === 'line' && (yAxis.toLowerCase().includes('revenue') || yAxis.toLowerCase().includes('sales') || yAxis.toLowerCase().includes('total'))) {
    type = 'area';
  }

  if (type !== 'none' && type !== 'metric') {
    if (!xAxis || !yAxis || !rows[0].hasOwnProperty(xAxis) || !rows[0].hasOwnProperty(yAxis)) {
      type = 'none';
    }
  }

  return { type, xAxis, yAxis };
}

export default function App() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Schema Explorer States
  const [schema, setSchema] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});
  
  // Theme State
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch Database Schema
  const fetchSchema = async () => {
    setSchemaLoading(true);
    setSchemaError(false);
    try {
      const response = await axios.get(`${API_URL}/api/schema`);
      setSchema(response.data);
      // Auto expand first table
      if (response.data && response.data.length > 0) {
        setExpandedTables({ [response.data[0].name]: true });
      }
    } catch (err) {
      console.warn("Could not load schema from API, falling back to seed details.", err);
      setSchema(FALLBACK_SCHEMA);
      setExpandedTables({ [FALLBACK_SCHEMA[0].name]: true });
      setSchemaError(true);
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
  }, []);

  const toggleTable = (tableName) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: !prev[tableName]
    }));
  };

  const handleQuickQuestion = (qText) => {
    setQuestion(qText);
    setSidebarOpen(false);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!question.trim()) return;

    const userMsg = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/query`, {
        question: userMsg.content,
        session_id: sessionId
      });

      const aiMsg = {
        role: 'assistant',
        content: response.data.answer,
        sql: response.data.sql,
        rows: response.data.rows,
        columns: response.data.columns,
        chart: response.data.chart,
        agent_steps: response.data.agent_steps,
        error: response.data.error ? "The generated SQL could not be executed." : null
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      let errorMsg = 'An error occurred';
      if (error.response) {
        const status = error.response.status;
        const detail = error.response.data?.detail || error.response.data?.message || '';
        const detailStr = String(detail);
        
        if (status === 502) {
          if (detailStr.includes("could not generate a valid SQL query") || detailStr.includes("failed to generate SQL")) {
            errorMsg = "The AI could not generate a valid SQL query.";
          } else {
            errorMsg = "AI model service is unavailable. Please check the Ollama configuration.";
          }
        } else if (status === 503) {
          errorMsg = "Unable to connect to the database.";
        } else if (detailStr.includes("execution failed") || detailStr.includes("SQLExecutionError") || detailStr.includes("database execution failed")) {
          errorMsg = "The generated SQL could not be executed.";
        } else if (status === 404) {
          errorMsg = "Unable to connect to FastAPI.";
        } else {
          errorMsg = detail || error.message;
        }
      } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || error.code === 'ERR_CONNECTION_REFUSED') {
        errorMsg = 'Unable to connect to FastAPI.';
      } else if (error.message) {
        errorMsg = error.message;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        error: errorMsg
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-app-bg text-app-text-primary font-sans overflow-hidden transition-colors duration-200">
      
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
        />
      )}

      {/* Sidebar: Schema Explorer & Quick Questions */}
      <aside className={`w-80 border-r border-app-border bg-app-header/40 flex flex-col h-full sidebar-transition z-30 
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} 
        absolute md:relative`}
      >
        <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-header/80">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-sm tracking-wider uppercase">Data Explorer</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 rounded hover:bg-app-bg/50 text-app-text-secondary hover:text-app-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Tree Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-app-text-secondary px-1">
              <span>Tables & Columns</span>
              <button 
                onClick={fetchSchema} 
                className="hover:text-app-text-primary transition-colors cursor-pointer p-0.5 rounded"
                title="Refresh Schema"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${schemaLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {schemaLoading ? (
              <div className="space-y-3 p-1">
                <div className="h-4 bg-app-border rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-app-border rounded animate-pulse w-1/2"></div>
                <div className="h-4 bg-app-border rounded animate-pulse w-5/6"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {schema.map(table => (
                  <div key={table.name} className="border border-app-border/40 rounded-xl overflow-hidden bg-app-card/30">
                    <button
                      onClick={() => toggleTable(table.name)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium hover:bg-app-bg/30 transition-colors text-left font-mono"
                    >
                      <div className="flex items-center gap-2.5 text-app-text-primary">
                        {expandedTables[table.name] ? (
                          <FolderOpen className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Folder className="w-4 h-4 text-blue-400" />
                        )}
                        <span>{table.name}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-app-text-secondary transition-transform ${expandedTables[table.name] ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {expandedTables[table.name] && (
                      <div className="px-3 pb-3 pt-1 border-t border-app-border/20 bg-app-bg/5 space-y-1 text-xs">
                        {table.columns.map(col => (
                          <div key={col.name} className="flex items-center justify-between py-1 px-1.5 hover:bg-app-bg/50 rounded transition-colors group">
                            <span className="font-mono text-app-text-secondary flex items-center gap-1.5">
                              {col.is_pk ? (
                                <Key className="w-3 h-3 text-yellow-500" title="Primary Key" />
                              ) : (
                                <span className="w-3 h-3 block" />
                              )}
                              {col.name}
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-app-text-secondary/30 font-mono group-hover:text-app-text-secondary/60 transition-colors">
                              {col.type}
                            </span>
                          </div>
                        ))}
                        {table.foreign_keys && table.foreign_keys.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-app-border/20 text-[10px] text-app-text-secondary/40 space-y-1">
                            <div className="font-semibold uppercase tracking-wider text-[9px]">Foreign Keys:</div>
                            {table.foreign_keys.map((fk, fIdx) => (
                              <div key={fIdx} className="font-mono break-all leading-snug">
                                🔗 {fk.constrained_columns.join(',')} → {fk.referred_table}({fk.referred_columns.join(',')})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Questions Block */}
        <div className="p-4 border-t border-app-border bg-app-header/20">
          <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary px-2 mb-3">Quick Queries</h3>
          <div className="space-y-2">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickQuestion(q)}
                className="w-full text-left text-xs p-2.5 rounded-xl border border-app-border bg-app-card hover:bg-blue-600/5 hover:border-blue-500/20 transition-all hover-glow flex items-center justify-between cursor-pointer group"
              >
                <span className="text-app-text-secondary group-hover:text-app-text-primary transition-colors pr-2 leading-relaxed">{q}</span>
                <ChevronRight className="w-3.5 h-3.5 text-app-text-secondary/50 group-hover:text-blue-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Workspace Header */}
        <header className="bg-app-header border-b border-app-border px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-app-card border border-app-border text-app-text-primary hover:bg-app-bg transition-colors mr-2 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center">
                <Activity className="text-blue-500 w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                  AI SQL Data Analyst Workspace
                </h1>
                <div className="text-[10px] text-app-text-secondary flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span>PostgreSQL Connected</span>
                  {schemaError && <span className="text-amber-500 font-semibold">(Using Seed Schema)</span>}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-app-card border border-app-border hover:bg-app-bg transition-all hover-glow cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-yellow-400" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600" />
            )}
          </button>
        </header>

        {/* Message Logs */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {messages.length === 0 && (
            <div className="text-center text-app-text-secondary max-w-lg mx-auto mt-24 space-y-6 animate-fade-in-up">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-600/5 border border-blue-500/20 flex items-center justify-center">
                <Database className="w-8 h-8 text-blue-500 opacity-80" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-app-text-primary">Welcome to your AI SQL Analyst</p>
                <p className="text-sm opacity-70 leading-relaxed">
                  Ask conversational questions about orders, payments, customers, and product catalogs. The agent generates, validates, runs SQL, and plots charts automatically.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="p-3 border border-app-border rounded-xl bg-app-card/20 text-xs">
                  <span className="font-semibold block mb-1">Interactive Sidebar</span>
                  Review tables, structures, and relationships at a glance.
                </div>
                <div className="p-3 border border-app-border rounded-xl bg-app-card/20 text-xs">
                  <span className="font-semibold block mb-1">Dynamic Reports</span>
                  Toggled visualization, raw data, SQL scripts, and run logs.
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageCard key={idx} message={msg} theme={theme} />
          ))}

          {/* Glowing Skeleton Loader */}
          {loading && (
            <div className="flex gap-4 animate-fade-in-up">
              <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Database className="w-4 h-4 text-blue-400 animate-spin-slow" />
              </div>
              <div className="bg-app-card border border-app-border rounded-2xl p-6 shadow-md w-full max-w-[90%] glass-panel space-y-6 animate-pulse-slow">
                <div className="space-y-3">
                  <div className="h-4 bg-app-border rounded w-1/4"></div>
                  <div className="h-3 bg-app-border rounded w-5/6"></div>
                  <div className="h-3 bg-app-border rounded w-2/3"></div>
                </div>
                <div className="h-44 bg-app-border/20 rounded-xl flex items-end justify-between p-4 gap-2.5">
                  <div className="h-10 bg-app-border/40 rounded w-1/6"></div>
                  <div className="h-24 bg-app-border/40 rounded w-1/6"></div>
                  <div className="h-36 bg-app-border/40 rounded w-1/6"></div>
                  <div className="h-16 bg-app-border/40 rounded w-1/6"></div>
                  <div className="h-30 bg-app-border/40 rounded w-1/6"></div>
                </div>
                <div className="flex items-center gap-2 text-blue-500/80 text-xs font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Agent is compiling SQL and analyzing db records...</span>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Input Tray */}
        <footer className="p-6 bg-app-bg/50 border-t border-app-border/30 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your data (e.g. 'Show total sales by category as a bar chart')..."
              className="w-full bg-app-input border border-app-border rounded-xl py-4 pl-5 pr-28 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-lg text-app-text-primary placeholder:text-app-text-secondary/40 text-sm"
              disabled={loading}
            />
            <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ask AI</span>
              </button>
            </div>
          </form>
          <div className="max-w-4xl mx-auto text-center mt-2.5 text-[10px] text-app-text-secondary/50">
            Click any Table in the sidebar list to inspect columns. Use quick questions to query.
          </div>
        </footer>
      </div>
    </div>
  );
}

function MessageCard({ message, theme }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex gap-4 flex-row-reverse animate-fade-in-up max-w-3xl ml-auto">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-md">
          <span className="text-xs font-bold text-white uppercase">U</span>
        </div>
        <div className="bg-app-chat-user rounded-2xl px-5 py-3.5 shadow-md text-white text-sm max-w-[85%]">
          <p className="leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // AI response classification
  const visualDetails = getVisualizationDetails(message.rows, message.columns, message.chart);
  const showMetricCard = visualDetails.type === 'metric';
  const showChart = ['bar', 'line', 'pie', 'area'].includes(visualDetails.type);
  const showVisualization = showMetricCard || showChart;
  
  // Decide default tab
  let defaultTab = 'sql';
  if (showVisualization) defaultTab = 'visualization';
  else if (message.rows && message.rows.length > 0) defaultTab = 'table';
  else if (message.agent_steps && message.agent_steps.length > 0) defaultTab = 'activity';
  
  const [activeTab, setActiveTab] = useState(defaultTab);
  const showFallbackNotice = visualDetails.type === 'none' && message.rows && message.rows.length > 0;

  return (
    <div className="flex gap-4 animate-fade-in-up max-w-[95%]">
      <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <Database className="w-4 h-4 text-white" />
      </div>
      <div className="bg-app-chat-ai border border-app-border rounded-2xl p-6 shadow-lg space-y-6 w-full glass-panel hover-glow">
        {message.error ? (
          <div className="text-red-500 bg-red-950/10 p-4 rounded-xl border border-red-900/20 flex items-start gap-3">
            <Info className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm font-medium">
              <span className="font-bold">Error:</span> {message.error}
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Insights Text - Always visible */}
            <div className="prose prose-invert max-w-none text-app-text-primary text-sm">
              <div className="markdown-content">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>

            {/* Tab header buttons */}
            {(showVisualization || (message.rows && message.rows.length > 0) || message.sql || (message.agent_steps && message.agent_steps.length > 0)) && (
              <div className="border-b border-app-border/40 pb-px flex flex-wrap gap-2">
                {showVisualization && (
                  <button
                    onClick={() => setActiveTab('visualization')}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
                      activeTab === 'visualization'
                        ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                        : 'border-transparent text-app-text-secondary hover:text-app-text-primary'
                    }`}
                  >
                    <PieChartIcon className="w-3.5 h-3.5" />
                    <span>Visualization</span>
                  </button>
                )}

                {message.rows && message.rows.length > 0 && (
                  <button
                    onClick={() => setActiveTab('table')}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
                      activeTab === 'table'
                        ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                        : 'border-transparent text-app-text-secondary hover:text-app-text-primary'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Data Table ({message.rows.length})</span>
                  </button>
                )}

                {message.sql && (
                  <button
                    onClick={() => setActiveTab('sql')}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
                      activeTab === 'sql'
                        ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                        : 'border-transparent text-app-text-secondary hover:text-app-text-primary'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>SQL Query</span>
                  </button>
                )}

                {message.agent_steps && message.agent_steps.length > 0 && (
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
                      activeTab === 'activity'
                        ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                        : 'border-transparent text-app-text-secondary hover:text-app-text-primary'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Workflow Process</span>
                  </button>
                )}
              </div>
            )}

            {/* Tab Body contents */}
            <div className="pt-1">
              {activeTab === 'visualization' && showVisualization && (
                <div className="animate-fade-in-up">
                  {showMetricCard && (
                    <MetricCard title={visualDetails.key} value={visualDetails.value} />
                  )}
                  {showChart && (
                    <ChartViewer
                      chart={{
                        type: visualDetails.type,
                        data: message.rows,
                        xAxis: visualDetails.xAxis,
                        yAxis: visualDetails.yAxis
                      }}
                      theme={theme}
                    />
                  )}
                </div>
              )}

              {activeTab === 'table' && message.rows && message.rows.length > 0 && (
                <TableViewer rows={message.rows} columns={message.columns} />
              )}

              {activeTab === 'sql' && message.sql && (
                <SqlViewer sql={message.sql} />
              )}

              {activeTab === 'activity' && message.agent_steps && message.agent_steps.length > 0 && (
                <AgentActivity steps={message.agent_steps} />
              )}
              
              {showFallbackNotice && (
                <div className="mt-4 p-3.5 border border-app-border rounded-xl bg-app-bg/30 flex items-center gap-2.5 text-app-text-secondary text-xs">
                  <Info className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <span>Showing results in grid below. Structured charts are unavailable for this table geometry.</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value }) {
  const formattedVal = formatCellValue(value, title);
  return (
    <div className="bg-app-card/60 border border-app-border rounded-2xl p-6 shadow-md max-w-sm mx-auto my-2 flex flex-col items-center justify-center text-center glass-panel">
      <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary mb-2.5">
        {title.replace(/_/g, ' ')}
      </span>
      <span className="text-3xl font-extrabold text-blue-500 tracking-tight">
        {formattedVal}
      </span>
    </div>
  );
}

function AgentActivity({ steps }) {
  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card/40 shadow-sm animate-fade-in-up">
      <div className="p-3 bg-app-header/60 border-b border-app-border flex items-center gap-2 text-xs text-app-text-secondary font-medium">
        <Activity className="w-4 h-4 text-teal-500" />
        <span>Workflow Trace Logs</span>
      </div>
      
      <div className="p-5 bg-app-bg/10">
        <div className="relative border-l border-app-border pl-6 ml-2 space-y-5">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[30px] top-0.5 bg-app-bg border border-teal-500 rounded-full w-4 h-4 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              </div>
              
              <div className="text-xs text-app-text-primary leading-relaxed font-medium">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SqlViewer({ sql }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-input/30 shadow-md animate-fade-in-up">
      <div className="p-3 bg-app-header border-b border-app-border flex items-center justify-between text-xs text-app-text-secondary font-medium">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-500" />
          <span>Postgres Query Statement</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="px-2.5 py-1 rounded bg-app-card border border-app-border hover:bg-app-bg text-app-text-primary text-[10px] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy SQL'}</span>
        </button>
      </div>
      <div className="p-5 overflow-x-auto code-container">
        <pre className="text-xs text-blue-400 font-mono leading-relaxed select-all">
          <code>{sql}</code>
        </pre>
      </div>
    </div>
  );
}

function TableViewer({ rows, columns }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  if (!rows || rows.length === 0) return null;

  const totalPages = Math.ceil(rows.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

  const downloadCSV = () => {
    const headers = columns.join(',');
    const csvRows = rows.map(row => 
      columns.map(col => {
        const val = row[col];
        const valStr = val === null || val === undefined ? '' : String(val);
        return `"${valStr.replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card/40 shadow-md animate-fade-in-up">
      <div className="p-3 bg-app-header border-b border-app-border flex items-center justify-between text-xs text-app-text-secondary font-medium">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-purple-500" />
          <span>Search Results Table</span>
        </div>
        <button
          onClick={downloadCSV}
          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] text-app-text-secondary uppercase bg-app-header/60 border-b border-app-border font-bold">
            <tr>
              {columns.map(col => (
                <th key={col} className={`px-4 py-3 ${isNumericColumn(rows, col) ? 'text-right' : 'text-left'}`}>
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr key={idx} className="border-b border-app-border/40 hover:bg-app-bg/20 transition-colors last:border-0">
                {columns.map(col => (
                  <td key={col} className={`px-4 py-2.5 font-mono text-app-text-primary ${isNumericColumn(rows, col) ? 'text-right' : 'text-left'}`}>
                    {formatCellValue(row[col], col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 bg-app-header/40 border-t border-app-border/40 flex items-center justify-between text-[11px] text-app-text-secondary">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-app-input border border-app-border rounded px-1.5 py-0.5 focus:outline-none"
            >
              <option value={5}>5 rows</option>
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
            </select>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-2 py-1 rounded border border-app-border/60 hover:bg-app-bg/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-2 py-1 rounded border border-app-border/60 hover:bg-app-bg/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartViewer({ chart, theme }) {
  if (!chart || !chart.data || chart.data.length === 0) return null;

  const { type, data, xAxis, yAxis } = chart;

  const isDark = theme === 'dark';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const labelColor = isDark ? '#64748b' : '#475569';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';

  const formatTooltip = (value, name) => {
    return [formatCellValue(value, yAxis), name.replace(/_/g, ' ')];
  };

  const formatAxis = (value) => {
    if (typeof value === 'number') {
      const isMoney = /revenue|sales|price|amount|payment|total|cost|budget|profit/i.test(yAxis);
      if (isMoney) {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}m`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value}`;
      }
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
    }
    return value;
  };

  const renderCustomizedTick = (props) => {
    const { x, y, payload } = props;
    const value = payload.value;
    const isLong = value.toString().length > 12;
    const labelText = isLong ? `${value.toString().substring(0, 10)}...` : value;

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fill={labelColor}
          fontSize="10px"
          className="font-sans font-medium"
        >
          {labelText}
        </text>
      </g>
    );
  };

  return (
    <div className="mt-4 border border-app-border rounded-xl overflow-hidden bg-app-card/30 p-5 shadow-md glass-panel">
      <div className="flex items-center justify-between text-xs text-app-text-secondary font-medium mb-5">
        <div className="flex items-center gap-2">
          <PieChartIcon className="w-4 h-4 text-orange-400" />
          <span className="capitalize">Visualization · {type} Chart</span>
        </div>
        <div className="text-[10px] opacity-60">X: {xAxis.replace(/_/g, ' ')} / Y: {yAxis.replace(/_/g, ' ')}</div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.7}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={xAxis} tick={renderCustomizedTick} />
              <YAxis stroke={labelColor} tick={{ fill: labelColor }} tickFormatter={formatAxis} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipText }}
                formatter={formatTooltip}
              />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
              <Bar dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} fill="url(#colorBar)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={xAxis} tick={renderCustomizedTick} />
              <YAxis stroke={labelColor} tick={{ fill: labelColor }} tickFormatter={formatAxis} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipText }}
                formatter={formatTooltip}
              />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
              <Line type="monotone" dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981', strokeWidth: 2 }} />
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={xAxis} tick={renderCustomizedTick} />
              <YAxis stroke={labelColor} tick={{ fill: labelColor }} tickFormatter={formatAxis} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipText }}
                formatter={formatTooltip}
              />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
              <Area type="monotone" dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorArea)" />
            </AreaChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yAxis}
                nameKey={xAxis}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#3b82f6"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={true}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipText }}
                formatter={formatTooltip}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          ) : (
            <div className="text-app-text-secondary text-center pt-20 text-xs flex flex-col items-center gap-2">
              <Info className="w-5 h-5 text-orange-400" />
              <span>Chart structure is unavailable for this data format.</span>
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

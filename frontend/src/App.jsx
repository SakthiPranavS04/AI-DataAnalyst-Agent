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
  Folder, FolderOpen, Key, ChevronRight, Menu, X, Play,
  Users, DollarSign, TrendingUp, Sparkles, Clock, Code, Search
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const QUICK_QUESTIONS = [
  "How many customers do we have?",
  "What is the total revenue?",
  "Which product generated the highest revenue?",
  "Show monthly revenue as a line chart.",
  "Show the top 5 products as a bar chart.",
  "Show payment method popularity as a pie chart."
];

const QUICK_QUESTIONS_WITH_ICONS = [
  { text: "How many customers do we have?", icon: 'users', desc: "Get customer database count" },
  { text: "What is the total revenue?", icon: 'dollar', desc: "Sum up complete transaction amounts" },
  { text: "Which product generated the highest revenue?", icon: 'trending', desc: "Find best performing product line" },
  { text: "Show monthly revenue as a line chart.", icon: 'line', desc: "Graph sales trends by month" },
  { text: "Show the top 5 products as a bar chart.", icon: 'bar', desc: "Rank top catalog items visually" },
  { text: "Show payment method popularity as a pie chart.", icon: 'pie', desc: "Breakdown user checkout patterns" }
];

const renderQuestionIcon = (iconName) => {
  switch(iconName) {
    case 'users': return <Users className="w-4 h-4 text-indigo-400" />;
    case 'dollar': return <DollarSign className="w-4 h-4 text-emerald-400" />;
    case 'trending': return <TrendingUp className="w-4 h-4 text-amber-400" />;
    case 'line': return <Activity className="w-4 h-4 text-indigo-400" />;
    case 'bar': return <BarChart className="w-4 h-4 text-purple-400" />;
    case 'pie': return <PieChartIcon className="w-4 h-4 text-pink-400" />;
    default: return <Database className="w-4 h-4 text-indigo-400" />;
  }
};

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
  const [searchQuery, setSearchQuery] = useState('');

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
    triggerQuickQuestion(qText);
  };

  const triggerQuickQuestion = async (qText) => {
    setQuestion('');
    setSidebarOpen(false);
    
    const userMsg = { role: 'user', content: qText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/query`, {
        question: qText,
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

  // Search filter logic for schema explorer tree
  const filteredSchema = schema.map(table => {
    const tableMatch = table.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchedCols = table.columns.filter(col => 
      col.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      col.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (tableMatch || matchedCols.length > 0) {
      return {
        ...table,
        columns: matchedCols.length > 0 ? matchedCols : table.columns,
        isMatched: matchedCols.length > 0 && !tableMatch
      };
    }
    return null;
  }).filter(Boolean);

  const displaySchema = searchQuery.trim() ? filteredSchema : schema;
  const isSearching = searchQuery.trim().length > 0;

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
            <Database className="w-4 h-4 text-indigo-500 animate-pulse" />
            <span className="font-bold text-xs tracking-wider uppercase">Database Explorer</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-app-bg/50 text-app-text-secondary hover:text-app-text-primary transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Database Tree Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-app-text-secondary px-1">
              <span>Tables & Columns</span>
              <button 
                onClick={fetchSchema} 
                className="hover:text-app-text-primary transition-colors cursor-pointer p-0.5 rounded"
                title="Refresh Schema"
              >
                <RefreshCw className={`w-3 h-3 ${schemaLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Search Input for Tree */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-app-text-secondary/40" />
              <input
                type="text"
                placeholder="Filter tables or columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-app-input/50 border border-app-border rounded-xl py-2 pl-9 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-app-text-primary placeholder:text-app-text-secondary/35 font-sans"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-[10px] text-app-text-secondary/40 hover:text-app-text-primary"
                >
                  Clear
                </button>
              )}
            </div>
            
            {schemaLoading ? (
              <div className="space-y-3 p-1">
                <div className="h-4 bg-app-border rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-app-border rounded animate-pulse w-1/2"></div>
                <div className="h-4 bg-app-border rounded animate-pulse w-5/6"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {displaySchema.length === 0 ? (
                  <div className="text-center text-xs text-app-text-secondary/50 py-6">No matching tables found</div>
                ) : (
                  displaySchema.map(table => {
                    const isExpanded = expandedTables[table.name] || (isSearching && table.isMatched);
                    return (
                      <div key={table.name} className="border border-app-border/40 rounded-xl overflow-hidden bg-app-card/30">
                        <button
                          onClick={() => toggleTable(table.name)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium hover:bg-app-bg/30 transition-colors text-left font-mono"
                        >
                          <div className="flex items-center gap-2.5 text-app-text-primary">
                            {isExpanded ? (
                              <FolderOpen className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Folder className="w-4 h-4 text-blue-400" />
                            )}
                            <span className={searchQuery && table.name.toLowerCase().includes(searchQuery.toLowerCase()) ? "bg-indigo-500/25 px-1 rounded text-indigo-300" : ""}>
                              {table.name}
                            </span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-app-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-app-border/20 bg-app-bg/5 space-y-1 text-xs">
                            {table.columns.map(col => {
                              const isColMatched = searchQuery && col.name.toLowerCase().includes(searchQuery.toLowerCase());
                              return (
                                <div key={col.name} className="flex items-center justify-between py-1 px-1.5 hover:bg-app-bg/50 rounded transition-colors group">
                                  <span className="font-mono text-app-text-secondary flex items-center gap-1.5">
                                    {col.is_pk ? (
                                      <Key className="w-3 h-3 text-yellow-500" title="Primary Key" />
                                    ) : (
                                      <span className="w-3 h-3 block" />
                                    )}
                                    <span className={isColMatched ? "bg-indigo-500/25 px-1 rounded text-indigo-300" : ""}>
                                      {col.name}
                                    </span>
                                  </span>
                                  <span className="text-[10px] uppercase font-semibold text-app-text-secondary/30 font-mono group-hover:text-app-text-secondary/60 transition-colors">
                                    {col.type}
                                  </span>
                                </div>
                              );
                            })}
                            {table.foreign_keys && table.foreign_keys.length > 0 && (
                              <div className="pt-2 mt-2 border-t border-app-border/20 text-[10px] text-app-text-secondary/40 space-y-1">
                                <div className="font-semibold uppercase tracking-wider text-[9px]">Relations:</div>
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
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Questions Block */}
        <div className="p-4 border-t border-app-border bg-app-header/20">
          <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary px-2 mb-3">Quick Queries</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickQuestion(q)}
                className="w-full text-left text-xs p-2.5 rounded-xl border border-app-border bg-app-card hover:bg-indigo-600/5 hover:border-indigo-500/20 transition-all hover-glow flex items-center justify-between cursor-pointer group"
              >
                <span className="text-app-text-secondary group-hover:text-app-text-primary transition-colors pr-2 leading-relaxed line-clamp-1">{q}</span>
                <ChevronRight className="w-3.5 h-3.5 text-app-text-secondary/50 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
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
              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center">
                <Activity className="text-indigo-500 w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base md:text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-blue-400 to-teal-400">
                  AI SQL Business Intelligence
                </h1>
                <div className="text-[10px] text-app-text-secondary flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="font-semibold text-green-500/90">PostgreSQL Connected</span>
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
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>
        </header>

        {/* Message Logs */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {messages.length === 0 && (
            <div className="max-w-4xl mx-auto mt-8 md:mt-16 space-y-10 animate-fade-in-up px-4">
              
              {/* Landing Hero */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>LangGraph Agentic Workflow Active</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-blue-400 to-teal-400">
                  Interactive Database Analyst
                </h2>
                <p className="text-app-text-secondary text-xs md:text-sm max-w-xl mx-auto leading-relaxed">
                  Query product inventories, checkout statistics, and customer metrics in natural English. The agent generates SQL, executes safely, and charts outputs automatically.
                </p>
              </div>

              {/* Quick Questions Grid */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-app-text-secondary/70 text-center">
                  Select a template to query database
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {QUICK_QUESTIONS_WITH_ICONS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickQuestion(q.text)}
                      className="text-left p-5 rounded-2xl border border-app-border bg-app-card/30 hover:bg-app-card/75 hover:border-indigo-500/30 hover-glow transition-all flex flex-col justify-between h-36 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="p-2.5 rounded-xl bg-app-header border border-app-border group-hover:border-indigo-500/20 group-hover:bg-indigo-500/5 transition-colors">
                          {renderQuestionIcon(q.icon)}
                        </div>
                        <ChevronRight className="w-4 h-4 text-app-text-secondary/30 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-app-text-primary leading-snug group-hover:text-indigo-400 transition-colors">
                          {q.text}
                        </h4>
                        <p className="text-[10px] text-app-text-secondary/60">
                          {q.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Core Features */}
              <div className="border border-app-border rounded-2xl bg-app-card/15 p-5 flex flex-col md:flex-row gap-5 items-center justify-between glass-panel">
                <div className="space-y-1 text-center md:text-left">
                  <h4 className="text-xs font-bold text-app-text-primary flex items-center justify-center md:justify-start gap-1.5">
                    <Database className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
                    Interactive Schema Inspector
                  </h4>
                  <p className="text-[10px] text-app-text-secondary/70 leading-relaxed">
                    View active databases, table structures, Primary/Foreign keys, and data geometries in the sidebar.
                  </p>
                </div>
                <div className="h-px w-full md:h-10 md:w-px bg-app-border/40" />
                <div className="space-y-1 text-center md:text-left">
                  <h4 className="text-xs font-bold text-app-text-primary flex items-center justify-center md:justify-start gap-1.5">
                    <Code className="w-3.5 h-3.5 text-indigo-400" />
                    Safe AST Validations
                  </h4>
                  <p className="text-[10px] text-app-text-secondary/70 leading-relaxed">
                    All queries are parsed via SQLGlot AST validation check, enforcing strict read-only execution constraints.
                  </p>
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
              <div className="w-8 h-8 rounded-xl bg-indigo-900/30 border border-indigo-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Database className="w-4 h-4 text-indigo-400 animate-spin-slow" />
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
                <div className="flex items-center gap-2 text-indigo-500/80 text-xs font-semibold">
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
              className="w-full bg-app-input border border-app-border rounded-xl py-4 pl-5 pr-28 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all shadow-lg text-app-text-primary placeholder:text-app-text-secondary/40 text-sm"
              disabled={loading}
            />
            <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
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
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-md">
          <span className="text-xs font-bold text-white uppercase">U</span>
        </div>
        <div className="bg-app-chat-user rounded-2xl px-5 py-3 shadow-md text-white text-sm max-w-[85%] font-medium">
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
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center flex-shrink-0 shadow-md">
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
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 tab-active-indicator'
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
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 tab-active-indicator'
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
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 tab-active-indicator'
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
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 tab-active-indicator'
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
      <span className="text-3xl font-extrabold text-indigo-500 tracking-tight">
        {formattedVal}
      </span>
    </div>
  );
}

function AgentActivity({ steps }) {
  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card/45 shadow-sm animate-fade-in-up">
      <div className="p-3 bg-app-header/60 border-b border-app-border flex items-center gap-2 text-xs text-app-text-secondary font-semibold">
        <Activity className="w-4 h-4 text-indigo-500" />
        <span>Workflow Trace Logs</span>
      </div>
      
      <div className="p-5 bg-app-bg/10">
        <div className="relative border-l border-app-border/60 pl-6 ml-2 space-y-5">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[30px] top-0.5 bg-app-bg border border-indigo-500 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              </div>
              
              <div className="text-xs text-app-text-primary leading-relaxed font-semibold">{step}</div>
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
    setTimeout(() => setCopied(false), 2000);
  };

  const sqlLines = sql.split('\n').filter(line => line.trim() !== '');

  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-[#0a0d16] shadow-md animate-fade-in-up font-mono">
      <div className="p-3 bg-app-header border-b border-app-border flex items-center justify-between text-xs text-app-text-secondary font-medium">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" />
          <span>PostgreSQL Statement</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="px-2.5 py-1 rounded-lg bg-app-card border border-app-border hover:bg-app-bg text-app-text-primary text-[10px] flex items-center gap-1.5 transition-all cursor-pointer font-sans font-semibold"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy SQL'}</span>
        </button>
      </div>
      <div className="p-4 flex overflow-x-auto text-[11px] leading-relaxed scrollbar-thin">
        {/* Line numbers */}
        <div className="text-right text-app-text-secondary/30 select-none pr-3 border-r border-app-border/40 space-y-1">
          {sqlLines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* SQL content */}
        <pre className="pl-3 text-indigo-300 select-all space-y-1 overflow-x-auto w-full">
          {sqlLines.map((line, i) => (
            <div key={i}>
              {line.split(' ').map((word, wordIdx) => {
                const uppercaseWord = word.toUpperCase();
                const isKeyword = [
                  'SELECT', 'FROM', 'JOIN', 'ON', 'WHERE', 'GROUP', 'BY', 'ORDER', 
                  'LIMIT', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'AND', 'OR', 'AS', 
                  'INNER', 'LEFT', 'RIGHT', 'OUTER', 'DESC', 'ASC', 'IN', 'ANY', 'ALL'
                ].includes(uppercaseWord.replace(/[(),;]/g, ''));
                
                return (
                  <span 
                    key={wordIdx} 
                    className={isKeyword ? "text-pink-500 font-semibold" : "text-slate-200"}
                  >
                    {word}{' '}
                  </span>
                );
              })}
            </div>
          ))}
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
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card/20 shadow-md animate-fade-in-up">
      <div className="p-3 bg-app-header border-b border-app-border flex items-center justify-between text-xs text-app-text-secondary font-semibold">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-indigo-500" />
          <span>Results Grid ({rows.length} rows)</span>
        </div>
        <button
          onClick={downloadCSV}
          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] flex items-center gap-1.5 transition-colors cursor-pointer font-semibold"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>
      
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] text-app-text-secondary uppercase bg-app-header/40 border-b border-app-border font-bold">
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
              <tr key={idx} className="border-b border-app-border/30 odd:bg-app-card/10 even:bg-app-card/25 hover:bg-indigo-500/5 transition-colors last:border-0">
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
          
          <div className="flex items-center gap-3 font-semibold">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 rounded-lg border border-app-border/60 hover:bg-app-bg/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-2.5 py-1 rounded-lg border border-app-border/60 hover:bg-app-bg/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0';
  const labelColor = isDark ? '#64748b' : '#475569';
  const tooltipBg = isDark ? '#080c16' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
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
      <div className="flex items-center justify-between text-xs text-app-text-secondary font-semibold mb-5">
        <div className="flex items-center gap-2">
          <PieChartIcon className="w-4 h-4 text-indigo-400" />
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
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7}/>
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
              <Line type="monotone" dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1', strokeWidth: 2 }} />
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
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
              <Area type="monotone" dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorArea)" />
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
                fill="#6366f1"
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
            <div className="text-app-text-secondary text-center pt-20 text-xs flex flex-col items-center gap-2 font-semibold">
              <Info className="w-5 h-5 text-orange-400" />
              <span>Chart structure is unavailable for this data format.</span>
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

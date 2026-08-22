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
  Sun, Moon, Info
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-app-bg text-app-text-primary font-sans transition-colors duration-200">
      <header className="bg-app-header border-b border-app-border p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="text-blue-500 w-8 h-8" />
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              AI SQL Data Analyst Dashboard
            </h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-app-card border border-app-border hover:bg-app-bg transition-colors cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-blue-600" />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 flex flex-col h-[calc(100vh-80px)]">
        <div className="flex-1 overflow-y-auto space-y-6 pb-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="text-center text-app-text-secondary mt-20 space-y-4">
              <Database className="w-16 h-16 mx-auto opacity-20 text-blue-500" />
              <p className="text-xl font-medium">Ask a question about your business data.</p>
              <p className="text-sm opacity-70">Example: "What are the top 5 products by revenue?" or "Show monthly revenue."</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageCard key={idx} message={msg} theme={theme} />
          ))}

          {loading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Database className="w-5 h-5 text-blue-400 animate-spin-slow" />
              </div>
              <div className="bg-app-card border border-app-border rounded-xl p-4 shadow-md max-w-sm">
                <div className="flex items-center gap-2 text-blue-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" />
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
                  <span className="ml-2 text-sm font-medium">Agent is analyzing data...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 relative">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your data..."
            className="w-full bg-app-input border border-app-border rounded-xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-lg text-app-text-primary placeholder:text-app-text-secondary/50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </main>
    </div>
  );
}

function MessageCard({ message, theme }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex gap-4 flex-row-reverse animate-fade-in-up">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-md">
          <span className="text-sm font-bold text-white">U</span>
        </div>
        <div className="bg-app-chat-user rounded-2xl px-5 py-3.5 max-w-[80%] shadow-md text-white text-base">
          <p className="leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // Smart visualization details extraction
  const visualDetails = getVisualizationDetails(message.rows, message.columns, message.chart);
  const showMetricCard = visualDetails.type === 'metric';
  const showChart = ['bar', 'line', 'pie', 'area'].includes(visualDetails.type);
  const showFallbackNotice = visualDetails.type === 'none' && message.rows && message.rows.length > 0;

  return (
    <div className="flex gap-4 animate-fade-in-up">
      <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <Database className="w-4 h-4 text-white" />
      </div>
      <div className="bg-app-chat-ai border border-app-border rounded-2xl p-6 max-w-[90%] shadow-lg space-y-6 w-full">
        {message.error ? (
          <div className="text-red-500 bg-red-950/20 p-4 rounded-xl border border-red-900/30 flex items-start gap-3">
            <Info className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm font-medium">
              <span className="font-bold">Error:</span> {message.error}
            </div>
          </div>
        ) : (
          <>
            <div className="prose prose-invert max-w-none text-app-text-primary text-base">
              <div className="markdown-content">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>

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

            {showFallbackNotice && (
              <div className="p-4 border border-app-border rounded-xl bg-app-bg/50 flex items-center gap-3 text-app-text-secondary text-sm">
                <Info className="w-4 h-4 text-orange-400" />
                <span>Visualization not applicable for this result format. Showing data table below.</span>
              </div>
            )}

            {message.rows && message.rows.length > 0 && (
              <TableViewer rows={message.rows} columns={message.columns} />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-app-border/40">
              {message.agent_steps && message.agent_steps.length > 0 && (
                <AgentActivity steps={message.agent_steps} />
              )}

              {message.sql && (
                <SqlViewer sql={message.sql} />
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
    <div className="bg-app-card border border-app-border rounded-2xl p-6 shadow-md max-w-sm mx-auto my-2 flex flex-col items-center justify-center text-center">
      <span className="text-xs font-bold uppercase tracking-wider text-app-text-secondary mb-2">
        {title.replace(/_/g, ' ')}
      </span>
      <span className="text-3xl font-extrabold text-blue-500">
        {formattedVal}
      </span>
    </div>
  );
}

function AgentActivity({ steps }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3.5 text-sm text-app-text-secondary hover:text-app-text-primary hover:bg-app-bg/30 transition-colors font-medium cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-500" />
          <span>Agent Activity ({steps.length} steps)</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-4 border-t border-app-border bg-app-bg/20 max-h-[200px] overflow-y-auto">
          <ul className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-app-text-secondary leading-relaxed">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SqlViewer({ sql }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-app-border rounded-xl overflow-hidden bg-app-card shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3.5 text-sm text-app-text-secondary hover:text-app-text-primary hover:bg-app-bg/30 transition-colors font-medium cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-500" />
          <span>Generated SQL</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-4 border-t border-app-border bg-app-input overflow-x-auto">
          <pre className="text-sm text-blue-400 font-mono leading-relaxed">
            <code>{sql}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function TableViewer({ rows, columns }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-4 border border-app-border rounded-xl overflow-hidden bg-app-card shadow-md">
      <div className="p-3 bg-app-header border-b border-app-border flex items-center gap-2 text-sm text-app-text-secondary font-medium">
        <Table className="w-4 h-4 text-purple-500" />
        <span>Data Result Table</span>
      </div>
      <div className="overflow-x-auto max-h-[300px]">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-app-text-secondary uppercase bg-app-header border-b border-app-border sticky top-0 font-semibold z-1">
            <tr>
              {columns.map(col => (
                <th key={col} className={`px-4 py-3 ${isNumericColumn(rows, col) ? 'text-right' : 'text-left'}`}>
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-app-border hover:bg-app-bg/30 transition-colors last:border-0">
                {columns.map(col => (
                  <td key={col} className={`px-4 py-3 font-mono text-app-text-primary ${isNumericColumn(rows, col) ? 'text-right' : 'text-left'}`}>
                    {formatCellValue(row[col], col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value}`;
      }
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
          fontSize="11px"
          className="font-sans font-medium"
        >
          {labelText}
        </text>
      </g>
    );
  };

  return (
    <div className="mt-4 border border-app-border rounded-xl overflow-hidden bg-app-card p-5 shadow-md">
      <div className="flex items-center gap-2 text-sm text-app-text-secondary font-medium mb-4">
        <PieChartIcon className="w-4 h-4 text-orange-400" />
        <span className="capitalize">Visualization · {type} Chart</span>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={xAxis} tick={renderCustomizedTick} />
              <YAxis stroke={labelColor} tick={{ fill: labelColor }} tickFormatter={formatAxis} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', color: tooltipText }}
                formatter={formatTooltip}
              />
              <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
              <Bar dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
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
              <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
              <Line type="monotone" dataKey={yAxis} name={yAxis.replace(/_/g, ' ')} stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} />
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
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
              <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
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
                outerRadius={90}
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
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          ) : (
            <div className="text-app-text-secondary text-center pt-20 text-sm flex flex-col items-center gap-2">
              <Info className="w-6 h-6 text-orange-400" />
              <span>Visualization unavailable for this result.</span>
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

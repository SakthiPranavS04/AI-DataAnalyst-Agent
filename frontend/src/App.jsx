import { useState } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { Database, Send, Terminal, Activity, Table, PieChart as PieChartIcon, ChevronDown, ChevronUp } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function App() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(crypto.randomUUID());

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
        error: response.data.error
      };
      
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      let errorMsg = 'An error occurred';
      if (error.message === 'Network Error' || error.code === 'ERR_CONNECTION_REFUSED') {
        errorMsg = 'Unable to connect to the backend. Make sure FastAPI is running on http://localhost:8000.';
      } else if (error.response?.data?.detail) {
        errorMsg = error.response.data.detail;
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
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      <header className="bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Database className="text-blue-500 w-8 h-8" />
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
            AI SQL Data Analyst
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 flex flex-col h-[calc(100vh-80px)]">
        <div className="flex-1 overflow-y-auto space-y-6 pb-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <Database className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-xl">Ask a question about your business data.</p>
              <p className="text-sm mt-2">Example: "What are the top 5 products by revenue?"</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageCard key={idx} message={msg} />
          ))}

          {loading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Database className="w-5 h-5 text-blue-300" />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{animationDelay: '0.2s'}} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{animationDelay: '0.4s'}} />
                  <span className="ml-2 text-sm">Agent is thinking...</span>
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
            className="w-full bg-gray-900 border border-gray-700 rounded-xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-lg text-white"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </main>
    </div>
  );
}

function MessageCard({ message }) {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return (
      <div className="flex gap-4 flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold">U</span>
        </div>
        <div className="bg-blue-600 rounded-lg p-4 max-w-[80%] shadow-md">
          <p>{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_rgba(20,184,166,0.5)]">
        <Database className="w-4 h-4 text-white" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 max-w-[90%] shadow-lg space-y-4">
        {message.error ? (
          <div className="text-red-400 bg-red-950/50 p-3 rounded-md border border-red-900/50">
            Error: {message.error}
          </div>
        ) : (
          <>
            <div className="prose prose-invert max-w-none">
              <p className="text-lg leading-relaxed">{message.content}</p>
            </div>
            
            {message.agent_steps && message.agent_steps.length > 0 && (
              <AgentActivity steps={message.agent_steps} />
            )}

            {message.sql && (
              <SqlViewer sql={message.sql} />
            )}

            {message.chart && (
              <ChartViewer chart={message.chart} />
            )}

            {message.rows && message.rows.length > 0 && !message.chart && (
              <TableViewer rows={message.rows} columns={message.columns} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AgentActivity({ steps }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="border border-gray-800 rounded-md overflow-hidden bg-gray-950/50">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-sm text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-500" />
          <span>Agent Activity ({steps.length} steps)</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      
      {open && (
        <div className="p-3 border-t border-gray-800 bg-black/20">
          <ul className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                {step}
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
    <div className="border border-gray-800 rounded-md overflow-hidden">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-sm text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors bg-gray-900"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span>Generated SQL</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      
      {open && (
        <div className="p-4 bg-[#0d1117] overflow-x-auto">
          <pre className="text-sm text-blue-300 font-mono">
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
    <div className="mt-4 border border-gray-800 rounded-md overflow-hidden bg-gray-900">
      <div className="p-2 bg-gray-800/50 border-b border-gray-800 flex items-center gap-2 text-sm text-gray-400">
        <Table className="w-4 h-4 text-purple-400" />
        <span>Data Result</span>
      </div>
      <div className="overflow-x-auto max-h-[300px]">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-950/50 sticky top-0">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-4 py-3">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                {columns.map(col => (
                  <td key={col} className="px-4 py-3 font-mono text-gray-300">
                    {row[col]?.toString()}
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

function ChartViewer({ chart }) {
  if (!chart || !chart.data || chart.data.length === 0) return null;
  
  const { type, data, xAxis, yAxis } = chart;
  
  return (
    <div className="mt-4 border border-gray-800 rounded-md overflow-hidden bg-gray-900 p-4">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <PieChartIcon className="w-4 h-4 text-orange-400" />
        <span className="capitalize">{type} Chart</span>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey={xAxis} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
              <YAxis stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Legend />
              <Bar dataKey={yAxis} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey={xAxis} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
              <YAxis stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
              />
              <Legend />
              <Line type="monotone" dataKey={yAxis} stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
            </LineChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yAxis}
                nameKey={xAxis}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
              />
              <Legend />
            </PieChart>
          ) : (
             <div className="text-gray-500 text-center pt-20">Unsupported chart type</div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

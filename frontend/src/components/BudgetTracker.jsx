import React, { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend as ChartLegend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { Download, Plus, Trash2, Edit2, DollarSign, TrendingUp, TrendingDown, Wallet, LogOut, User, Sun, Moon } from 'lucide-react';
import axios from "axios";

ChartJS.register(ArcElement, ChartTooltip, ChartLegend, CategoryScale, LinearScale, BarElement);

const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
  expense: ['Food', 'Transport', 'Entertainment', 'Bills', 'Shopping', 'Health', 'Education', 'Other']
};

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function BudgetTracker() {
  // --- UI & filter state
  const [currentUser, setCurrentUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  // View / month
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Form & auth
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().slice(0, 10)
  });
  const [authForm, setAuthForm] = useState({ username: '', password: '', isLogin: true });

  // Filters & search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | income | expense
  const [filterCategory, setFilterCategory] = useState('all'); // all or category name
  const [dateFrom, setDateFrom] = useState(''); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState(''); // yyyy-mm-dd

  // Sorting
  const [sortBy, setSortBy] = useState('date'); // date | amount | category
  const [sortDir, setSortDir] = useState('desc'); // asc | desc

  // Budgets for categories (per-user map)
  const [budgets, setBudgets] = useState(() => {
    try {
      const saved = localStorage.getItem('bt_budgets');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Controlled budget creation inputs
  const [newBudgetCategory, setNewBudgetCategory] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');

  // Dark mode (class-based; persisted)
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const s = localStorage.getItem('bt_darkMode');
      return s ? JSON.parse(s) : false;
    } catch {
      return false;
    }
  });

  const API = axios.create({
    baseURL: `${window.location.protocol}//${window.location.hostname}:5000`,
    withCredentials: true,
  });

  API.interceptors.request.use((req) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      req.headers.Authorization = `Bearer ${token}`;
    }
    return req;
  });

  useEffect(() => {
    try { localStorage.setItem('bt_darkMode', JSON.stringify(darkMode)); } catch {}
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // --- Effects: load user
  useEffect(() => {
    const savedUser = localStorage.getItem("currentUser");
    if (savedUser) {
      setCurrentUser(savedUser);
      fetchTransactions();
    }
  }, []);


  useEffect(() => {
    try { localStorage.setItem('bt_budgets', JSON.stringify(budgets)); } catch {}
  }, [budgets]);

  // --- Data persistence helpers
  const loadUserData = (username) => {
    const data = localStorage.getItem(`transactions_${username}`);
    if (data) {
      try { setTransactions(JSON.parse(data)); } catch { setTransactions([]); }
    } else {
      setTransactions([]);
    }
  };

  const saveUserData = (username, data) => {
    localStorage.setItem(`transactions_${username}`, JSON.stringify(data));
  };

  // --- Auth handlers
  const handleAuth = async () => {
    const { username, password, isLogin } = authForm;

    if (!username || !password) {
      alert("Fill all fields");
      return;
    }

    try {
      const url = isLogin ? "/login" : "/register";

      const res = await API.post(url, {
        user: username,
        pwd: password,
      });

      //  ADD HERE
      localStorage.setItem("accessToken", res.data.accessToken);
      localStorage.setItem("currentUser", username);

      setCurrentUser(username);
      setAuthForm({ username: "", password: "", isLogin: true });

      fetchTransactions();
    } catch (err) {
      alert("Authentication failed");
    }
  };


  const fetchTransactions = async () => {
    try {
      const res = await API.get("/auth/transactions");
      setTransactions(res.data);
    } catch (err) {
      console.error("Failed to fetch transactions");
    }
  };

  const handleLogout = async () => {
    try {
      await API.post("/logout");
    } catch (e) {
      // ignore
    }
    localStorage.removeItem("accessToken");
    setCurrentUser(null);
    setTransactions([]);
  };

  // --- Transaction CRUD
  const handleSubmit = async () => {
    try {
      if (editingTransaction) {
        await API.put(`/auth/update/${editingTransaction._id}`, formData);
      } else {
        await API.post("/auth/create", formData);
      }

      fetchTransactions();
      setShowAddModal(false);
      setEditingTransaction(null);
    } catch (err) {
      alert("Failed to save transaction");
    }
  };

  const monthTransactions = useMemo(() => {
    return transactions.filter(
      t => t.date && t.date.startsWith(selectedMonth)
    );
  }, [transactions, selectedMonth]);

  const deleteTransaction = async (id) => {
    try {
      await API.delete(`/auth/delete/${id}`);
      fetchTransactions();
    } catch {
      alert("Delete failed");
    }
  };


  const editTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      type: transaction.type,
      amount: transaction.amount.toString(),
      category: transaction.category,
      description: transaction.description,
      date: transaction.date
    });
    setShowAddModal(true);
  };

  // --- Filters & sorting helper
  const applyFiltersAndSort = (txs) => {
    let rows = txs.slice();

    // filter month by default
    rows = rows.filter(t => t.date && t.date.startsWith(selectedMonth));

    // search (category, description)
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      rows = rows.filter(t =>
        (t.category || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    // type filter
    if (filterType !== 'all') rows = rows.filter(t => t.type === filterType);

    // category filter
    if (filterCategory !== 'all') rows = rows.filter(t => t.category === filterCategory);

    // date range filter
    if (dateFrom) rows = rows.filter(t => t.date >= dateFrom);
    if (dateTo) rows = rows.filter(t => t.date <= dateTo);

    // sorting
    rows.sort((a, b) => {
      if (sortBy === 'amount') {
        return sortDir === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
      if (sortBy === 'category') {
        return sortDir === 'asc'
          ? (a.category || '').localeCompare(b.category || '')
          : (b.category || '').localeCompare(a.category || '');
      }
      // default: date
      return sortDir === 'asc'
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date);
    });

    return rows;
  };

  // Use derived filtered list for UI
  const visibleTransactions = useMemo(
    () => applyFiltersAndSort(monthTransactions),
    [
      monthTransactions,
      searchTerm,
      filterType,
      filterCategory,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
    ]
  );


  // Totals derived from monthTransactions
  const totalIncome = useMemo(
    () =>
      monthTransactions
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const totalExpense = useMemo(
    () =>
      monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const balance = totalIncome - totalExpense;

  // --- Monthly summary helpers
  const calcCategoryTotals = (type) => {
    const map = {};
    monthTransactions
      .filter(t => t.type === type)
      .forEach(t => map[t.category] = (map[t.category] || 0) + t.amount);
    return map;
  };

  const highestExpenseCategory = () => {
    const m = calcCategoryTotals('expense');
    const entries = Object.entries(m);
    if (!entries.length) return null;
    entries.sort((a,b)=>b[1]-a[1]);
    return { category: entries[0][0], amount: entries[0][1] };
  };

  const lowestExpenseCategory = () => {
    const m = calcCategoryTotals('expense');
    const entries = Object.entries(m);
    if (!entries.length) return null;
    entries.sort((a,b)=>a[1]-b[1]);
    return { category: entries[0][0], amount: entries[0][1] };
  };

  const averageMonthlyExpense = () => {
    if (!transactions.length) return 0;
    const mm = {};
    transactions.forEach(t => {
      if (!t.date) return;
      const key = t.date.slice(0,7);
      if (t.type === 'expense') mm[key] = (mm[key] || 0) + t.amount;
    });
    const vals = Object.values(mm);
    if (!vals.length) return 0;
    return vals.reduce((s,v)=>s+v,0)/vals.length;
  };

  const predictedEndOfMonthBalance = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const txThisMonth = transactions.filter(t => t.date && t.date.startsWith(selectedMonth));
    const daysPassed = Math.min(today.getDate(), daysInMonth);
    const spentSoFar = txThisMonth.filter(t => t.type === 'expense').reduce((s,t)=>s+t.amount,0);
    const earnedSoFar = txThisMonth.filter(t => t.type === 'income').reduce((s,t)=>s+t.amount,0);

    const avgDailyExpense = daysPassed > 0 ? spentSoFar / daysPassed : 0;
    const projectedTotalExpense = avgDailyExpense * daysInMonth;
    const projectedTotalIncome = earnedSoFar;
    const projectedNet = projectedTotalIncome - projectedTotalExpense;
    const currentNet = earnedSoFar - spentSoFar;
    return { currentNet, projectedNet, projectedEndOfMonthBalance: projectedNet };
  };

  // --- Budgets helpers (per-user)
  const getUserBudgets = () => (budgets && budgets[currentUser]) ? budgets[currentUser] : {};
  const setUserBudget = (category, amount) => {
    setBudgets(prev => {
      const copy = { ...(prev || {}) };
      copy[currentUser] = { ...(copy[currentUser] || {}), [category]: Number(amount) || 0 };
      return copy;
    });
  };
  const removeUserBudget = (category) => {
    setBudgets(prev => {
      const copy = { ...(prev || {}) };
      if (copy[currentUser]) {
        delete copy[currentUser][category];
      }
      return copy;
    });
  };

  // --- CSV export (uses visibleTransactions)
  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Description'];
    const rows = visibleTransactions.map(t => [
      t.date,
      t.type,
      t.category,
      t.amount,
      (t.description || '')
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')) 
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_report_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Helper for categories list (for filters)
  const availableCategories = useMemo(() => {
    const s = new Set(transactions.map(t => t.category).filter(Boolean));
    return Array.from(s).sort();
  }, [transactions]);

  // --- Small UI helpers
  const toggleSortDir = () => setSortDir(s => s === 'asc' ? 'desc' : 'asc');

  // Utility used in charts
  function getCategoryTotalsForChart(type, txs) {
    const map = {};
    txs.filter(t => t.type === type).forEach(t => map[t.category] = (map[t.category] || 0) + t.amount);
    return Object.entries(map).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }

  // -------------------------
  // Render: if not logged in show auth
  // -------------------------
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4">
              <Wallet className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Budget Tracker</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Manage your finances with ease</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Username</label>
              <input
                type="text"
                value={authForm.username}
                onChange={(e) => setAuthForm({...authForm, username: e.target.value})}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Password</label>
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Enter password"
              />
            </div>

            <button onClick={handleAuth} className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors">
              {authForm.isLogin ? 'Login' : 'Register'}
            </button>

            <button
              onClick={() => setAuthForm({...authForm, isLogin: !authForm.isLogin})}
              className="w-full text-blue-500 hover:text-blue-700 text-sm font-medium"
            >
              {authForm.isLogin ? 'Need an account? Register' : 'Have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------
  // Main UI
  // -------------------------
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <header className="bg-white dark:bg-gray-800 shadow-md border-b dark:border-gray-700">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center">
              <Wallet size={20} />
            </div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Budget Tracker</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(d => !d)}
              title="Toggle dark mode"
              className="p-2 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100 hover:shadow-sm transition"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-full text-gray-700 dark:text-gray-100">
              <User size={16} />
              <span className="font-medium">{currentUser}</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Navigation */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveView('dashboard')} className={`px-5 py-2 rounded-lg font-medium ${activeView === 'dashboard' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Dashboard</button>
          <button onClick={() => setActiveView('transactions')} className={`px-5 py-2 rounded-lg font-medium ${activeView === 'transactions' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Transactions</button>
          <button onClick={() => setActiveView('analytics')} className={`px-5 py-2 rounded-lg font-medium ${activeView === 'analytics' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Analytics</button>
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <input type="month" value={selectedMonth} onChange={(e)=>setSelectedMonth(e.target.value)} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />

          <div className="flex gap-3">
            <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
              <Download size={16} />
              Export CSV
            </button>

            <button onClick={() => { setShowAddModal(true); setEditingTransaction(null); setFormData({ type:'expense', amount:'', category:'', description:'', date: new Date().toISOString().slice(0,10) }); }} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              <Plus size={16} />
              Add Transaction
            </button>
          </div>
        </div>

        {/* Dashboard */}
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Total Income</p>
                    <p className="text-3xl font-bold text-green-600">${totalIncome.toFixed(2)}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Total Expenses</p>
                    <p className="text-3xl font-bold text-red-600">${totalExpense.toFixed(2)}</p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <TrendingDown />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Balance</p>
                    <p className={`text-3xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>${balance.toFixed(2)}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <DollarSign />
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly summary & budgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Monthly Summary</h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <div>Highest expense: {(() => { const h = highestExpenseCategory(); return h ? `${h.category} — $${h.amount.toFixed(2)}` : '—'; })()}</div>
                  <div>Lowest expense: {(() => { const l = lowestExpenseCategory(); return l ? `${l.category} — $${l.amount.toFixed(2)}` : '—'; })()}</div>
                  <div>Avg monthly expense: ${averageMonthlyExpense().toFixed(2)}</div>
                  <div>Projected net this month: ${predictedEndOfMonthBalance().projectedNet.toFixed(2)}</div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Category Budgets</h3>

                <div className="space-y-3">
                  {Object.entries(getUserBudgets()).length ? (
                    Object.entries(getUserBudgets()).map(([cat, amt]) => {
                      const spent = monthTransactions.filter(t => t.type === 'expense' && t.category === cat).reduce((s,t)=>s+t.amount,0);
                      const pct = amt > 0 ? Math.min(100, (spent/amt)*100) : 0;
                      return (
                        <div key={cat} className="flex items-center gap-4">
                          <div className="w-36 text-sm text-gray-800 dark:text-gray-100">{cat} — ${amt}</div>
                          <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-20 text-right text-sm text-gray-700 dark:text-gray-200">${spent.toFixed(2)}</div>
                          <button onClick={()=>removeUserBudget(cat)} className="text-sm text-red-600">Remove</button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 dark:text-gray-400">No budgets set</div>
                  )}

                  <div className="flex items-center gap-3 mt-3">
                    <select value={newBudgetCategory} onChange={(e) => setNewBudgetCategory(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      <option value="">Select category</option>
                      {CATEGORIES.expense.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <input value={newBudgetAmount} onChange={(e) => setNewBudgetAmount(e.target.value)} type="number" placeholder="Amount" className="px-3 py-2 border rounded w-36 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                    <button onClick={() => {
                      if (!newBudgetCategory || !newBudgetAmount) { alert('pick category and amount'); return; }
                      setUserBudget(newBudgetCategory, Number(newBudgetAmount));
                      setNewBudgetCategory(''); setNewBudgetAmount('');
                    }} className="px-4 py-2 bg-blue-500 text-white rounded">Set Budget</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
                Recent Transactions
              </h2>

              <div className="space-y-3">
                {monthTransactions
                  .slice()
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 5)
                  .map((transaction) => (
                    <div
                      key={transaction._id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.type === "income"
                              ? "bg-green-100"
                              : "bg-red-100"
                          }`}
                        >
                          <DollarSign
                            className={
                              transaction.type === "income"
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          />
                        </div>

                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">
                            {transaction.category}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-300">
                            {transaction.description || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-bold ${
                            transaction.type === "income"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {transaction.type === "income" ? "+" : "-"}$
                          {transaction.amount.toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                          {transaction.date}
                        </p>
                      </div>
                    </div>
                  ))}

                {monthTransactions.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No transactions for this month
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Transactions view */}
        {activeView === 'transactions' && (
          <div>
            {/* Filters panel */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex flex-wrap gap-3 justify-between items-center">
              <div className="flex flex-wrap gap-3 items-center">
                <select value={filterType} onChange={(e)=>setFilterType(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  <option value="all">All</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>

                <select value={filterCategory} onChange={(e)=>setFilterCategory(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  <option value="all">All categories</option>
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>

                <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />

                <input type="text" placeholder="Search category/description" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>

              <div className="flex items-center gap-2">
                <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="category">Category</option>
                </select>
                <button onClick={toggleSortDir} className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">{sortDir === 'asc' ? 'Asc' : 'Desc'}</button>
                <button onClick={() => { setSearchTerm(''); setFilterType('all'); setFilterCategory('all'); setDateFrom(''); setDateTo(''); }} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded">Clear</button>
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map(transaction => (
                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{transaction.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-medium rounded-full ${transaction.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{transaction.type}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{transaction.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{transaction.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`font-semibold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>{transaction.type === 'income' ? '+' : '-'}${transaction.amount.toFixed(2)}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button onClick={() => editTransaction(transaction)} className="text-blue-600 hover:text-blue-800"><Edit2 /></button>
                          <button onClick={() => deleteTransaction(transaction.id)} className="text-red-600 hover:text-red-800"><Trash2 /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleTransactions.length===0 && <tr><td colSpan="6" className="text-center py-12 text-gray-500 dark:text-gray-400">No transactions found for this month</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Analytics view (Chart.js) */}
        {activeView === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Income by Category */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                Income by Category
              </h3>

              {getCategoryTotalsForChart('income', monthTransactions).length > 0 ? (
                <div className="w-full h-64 flex items-center justify-center">
                  <Pie
                    data={{
                      labels: getCategoryTotalsForChart('income', monthTransactions).map(d => d.name),
                      datasets: [{
                        data: getCategoryTotalsForChart('income', monthTransactions).map(d => d.value),
                        backgroundColor: getCategoryTotalsForChart('income', monthTransactions).map(
                          (_, i) => COLORS[i % COLORS.length]
                        ),
                        borderWidth: 0
                      }]
                    }}
                    options={{
                      plugins: { legend: { display: false } },
                      maintainAspectRatio: true,
                      aspect: 1.6
                    }}
                  />
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                  No income data
                </div>
              )}
            </div>

            {/* Expenses by Category */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                Expenses by Category
              </h3>

              {getCategoryTotalsForChart('expense', monthTransactions).length > 0 ? (
                <div className="w-full h-64 flex items-center justify-center">
                  <Pie
                    data={{
                      labels: getCategoryTotalsForChart('expense', monthTransactions).map(d => d.name),
                      datasets: [{
                        data: getCategoryTotalsForChart('expense', monthTransactions).map(d => d.value),
                        backgroundColor: getCategoryTotalsForChart('expense', monthTransactions).map(
                          (_, i) => COLORS[i % COLORS.length]
                        ),
                        borderWidth: 0
                      }]
                    }}
                    options={{
                      plugins: { legend: { display: false } },
                      maintainAspectRatio: true,
                      aspect: 1.6
                    }}
                  />
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                  No expense data
                </div>
              )}
            </div>

            {/* Income vs Expenses */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                Income vs Expenses
              </h3>

              <div className="w-full h-72">
                <Bar
                  data={{
                    labels: ['Income', 'Expenses', 'Balance'],
                    datasets: [{
                      label: 'Amount',
                      data: [totalIncome, totalExpense, Math.max(0, balance)],
                      backgroundColor: ['#3b82f6', '#ef4444', '#06b6d4'],
                      borderRadius: 8
                    }]
                  }}
                  options={{
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true } },
                    maintainAspectRatio: false
                  }}
                />
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Type</label>
                <select value={formData.type} onChange={(e)=>setFormData({...formData, type:e.target.value, category:''})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Category</label>
                <select value={formData.category} onChange={(e)=>setFormData({...formData, category:e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  <option value="">Select category</option>
                  {CATEGORIES[formData.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Amount</label>
                <input type="number" step="0.01" value={formData.amount} onChange={(e)=>setFormData({...formData, amount:e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="0.00" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Date</label>
                <input type="date" value={formData.date} onChange={(e)=>setFormData({...formData, date:e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Description</label>
                <textarea value={formData.description} onChange={(e)=>setFormData({...formData, description:e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" rows="3" placeholder="Add a note..." />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowAddModal(false); setEditingTransaction(null); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">{editingTransaction ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

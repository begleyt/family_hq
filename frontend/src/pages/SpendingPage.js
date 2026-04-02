import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Store,
  ChevronDown, ChevronUp, Receipt, Search, ArrowRight
} from 'lucide-react';
import ReceiptScanner from '../components/common/ReceiptScanner';

export default function SpendingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [searchComp, setSearchComp] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/walmart/spending-stats'),
      api.get('/walmart/monthly-spending'),
      api.get('/walmart/store-comparison'),
      api.get('/walmart/receipts'),
    ]).then(([statsRes, monthlyRes, compRes, receiptRes]) => {
      setStats(statsRes.data);
      setMonthly(monthlyRes.data);
      setComparison(compRes.data);
      setReceipts(receiptRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (user.role !== 'parent') return <div className="text-center text-red-500 mt-12">Access denied</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  const monthlyChange = stats && stats.lastMonth > 0
    ? Math.round(((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100) : null;

  // Group monthly data by month for display
  const monthGroups = {};
  monthly.forEach(m => {
    if (!monthGroups[m.month]) monthGroups[m.month] = { month: m.month, stores: {}, total: 0 };
    monthGroups[m.month].stores[m.store] = m.total;
    monthGroups[m.month].total += m.total;
  });
  const monthList = Object.values(monthGroups).slice(0, 6);

  // All unique stores
  const allStores = [...new Set(monthly.map(m => m.store))];
  const storeColors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];

  const [filterCat, setFilterCat] = useState('');
  const CATS = [
    { value: 'produce', label: 'Produce', emoji: '\u{1F34E}' },
    { value: 'dairy', label: 'Dairy', emoji: '\u{1F95B}' },
    { value: 'meat', label: 'Meat', emoji: '\u{1F969}' },
    { value: 'bakery', label: 'Bakery', emoji: '\u{1F35E}' },
    { value: 'frozen', label: 'Frozen', emoji: '\u{1F9CA}' },
    { value: 'pantry', label: 'Pantry', emoji: '\u{1F96B}' },
    { value: 'beverages', label: 'Beverages', emoji: '\u{1F964}' },
    { value: 'snacks', label: 'Snacks', emoji: '\u{1F36A}' },
    { value: 'household', label: 'Household', emoji: '\u{1F9F9}' },
    { value: 'other', label: 'Other', emoji: '\u{1F4E6}' },
  ];

  let filteredComp = comparison;
  if (searchComp) filteredComp = filteredComp.filter(c => c.name.toLowerCase().includes(searchComp.toLowerCase()));
  if (filterCat) filteredComp = filteredComp.filter(c => c.category === filterCat);

  // Group by category for display
  const compByCategory = {};
  filteredComp.forEach(item => {
    const cat = item.category || 'other';
    if (!compByCategory[cat]) compByCategory[cat] = [];
    compByCategory[cat].push(item);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Grocery Spending</h1>
        <ReceiptScanner onComplete={() => window.location.reload()} />
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card">
            <p className="text-xs text-slate-500 mb-1">This Month</p>
            <p className="text-2xl font-bold">${stats.thisMonth.toFixed(2)}</p>
            {monthlyChange !== null && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${monthlyChange > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {monthlyChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(monthlyChange)}% vs last month
              </p>
            )}
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 mb-1">Last Month</p>
            <p className="text-2xl font-bold">${stats.lastMonth.toFixed(2)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 mb-1">Avg Trip</p>
            <p className="text-2xl font-bold">${stats.avgTripCost.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-1">{stats.tripsThisMonth} trips this month</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 mb-1">Top Store</p>
            <p className="text-lg font-bold truncate">{stats.topStore || 'N/A'}</p>
            {stats.topStoreTotal > 0 && <p className="text-xs text-slate-400">${stats.topStoreTotal.toFixed(2)} this month</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { id: 'overview', label: 'Monthly', icon: TrendingUp },
          { id: 'compare', label: 'Price Compare', icon: Store },
          { id: 'receipts', label: 'Receipts', icon: Receipt },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-family-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Monthly Spending */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {monthList.length === 0 ? (
            <div className="card text-center py-8">
              <DollarSign size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-slate-500">No spending data yet</p>
              <p className="text-xs text-slate-400 mt-1">Scan receipts to start tracking</p>
            </div>
          ) : (
            <>
              {/* Store legend */}
              <div className="flex flex-wrap gap-2 mb-2">
                {allStores.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className={`w-3 h-3 rounded-full ${storeColors[i % storeColors.length]}`} /> {s}
                  </span>
                ))}
              </div>
              {monthList.map(m => {
                const maxTotal = Math.max(...monthList.map(ml => ml.total));
                return (
                  <div key={m.month} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                      <p className="text-lg font-bold">${m.total.toFixed(2)}</p>
                    </div>
                    {/* Stacked bar */}
                    <div className="h-6 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex">
                      {allStores.map((store, i) => {
                        const amount = m.stores[store] || 0;
                        const pct = maxTotal > 0 ? (amount / maxTotal) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <div key={store} className={`${storeColors[i % storeColors.length]} h-full transition-all`}
                            style={{ width: `${pct}%` }} title={`${store}: $${amount.toFixed(2)}`} />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {allStores.map((store, i) => {
                        const amount = m.stores[store];
                        if (!amount) return null;
                        return (
                          <span key={store} className="text-xs text-slate-500">
                            {store}: <span className="font-medium text-slate-700 dark:text-slate-200">${amount.toFixed(2)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Store Price Comparison */}
      {tab === 'compare' && (
        <div>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchComp} onChange={e => setSearchComp(e.target.value)}
                className="input-field pl-9 text-sm" placeholder="Search items..." />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input-field text-sm w-auto">
              <option value="">All Categories</option>
              {CATS.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          {filteredComp.length === 0 ? (
            <div className="card text-center py-8">
              <Store size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-slate-500">{searchComp || filterCat ? 'No matching items' : 'No price data yet'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {CATS.map(cat => {
                const catItems = compByCategory[cat.value];
                if (!catItems || catItems.length === 0) return null;
                return (
                  <div key={cat.value}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span>{cat.emoji}</span>
                      <h3 className="text-sm font-semibold text-slate-600">{cat.label}</h3>
                      <span className="text-xs text-slate-400">({catItems.length})</span>
                    </div>
                    <div className="space-y-2">
                      {catItems.map((item, i) => {
                        const cheapest = item.stores.reduce((a, b) => a.avgPrice < b.avgPrice ? a : b);
                        const savings = item.stores.length > 1
                          ? item.stores.reduce((a, b) => a.avgPrice > b.avgPrice ? a : b).avgPrice - cheapest.avgPrice
                          : 0;
                        return (
                          <div key={i} className="card py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-semibold">{item.name}</p>
                              {savings > 0 && (
                                <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                  Save ${savings.toFixed(2)} at {cheapest.store}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.stores.map((s, j) => (
                                <div key={j} className={`px-2.5 py-1 rounded-lg text-sm ${
                                  s.store === cheapest.store && item.stores.length > 1
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-slate-50 dark:bg-slate-700'
                                }`}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-xs">{s.store}</span>
                                    <span className={`font-bold ${s.store === cheapest.store && item.stores.length > 1 ? 'text-emerald-600' : ''}`}>
                                      ${s.avgPrice.toFixed(2)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">({s.timesBought}x)</span>
                                  </div>
                                  {s.brand && <p className="text-[10px] text-slate-400">{s.brand}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Receipt History */}
      {tab === 'receipts' && (
        <div>
          {receipts.length === 0 ? (
            <div className="card text-center py-8">
              <Receipt size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-slate-500">No receipts scanned yet</p>
              <p className="text-xs text-slate-400 mt-1">Scan a receipt from the Grocery page</p>
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.map((r, i) => (
                <div key={i} className="card">
                  <div onClick={() => setExpandedReceipt(expandedReceipt === i ? null : i)}
                    className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-family-100 dark:bg-family-900/30 flex items-center justify-center">
                        <Receipt size={18} className="text-family-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{r.store}</p>
                        <p className="text-xs text-slate-400">{new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} &middot; {r.itemCount} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">${r.total.toFixed(2)}</p>
                      {expandedReceipt === i ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>
                  {expandedReceipt === i && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-1">
                      {r.items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between py-1 text-sm">
                          <span className="text-slate-600 dark:text-slate-300 truncate">{item.name}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200 ml-2 shrink-0">${item.price.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700 font-bold">
                        <span>Total</span>
                        <span>${r.total.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

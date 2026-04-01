import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import {
  Plus, X, Search, Edit, Trash2, AlertTriangle, ShoppingCart,
  Refrigerator, Snowflake, Package, Coffee, Home
} from 'lucide-react';

const LOCATIONS = [
  { value: 'fridge', label: 'Fridge', emoji: '\u{1F9CA}', icon: Refrigerator },
  { value: 'freezer', label: 'Freezer', emoji: '\u{2744}\u{FE0F}', icon: Snowflake },
  { value: 'pantry', label: 'Pantry', emoji: '\u{1F3E0}', icon: Home },
  { value: 'cabinet', label: 'Cabinet', emoji: '\u{1F4E6}', icon: Package },
  { value: 'counter', label: 'Counter', emoji: '\u{2615}', icon: Coffee },
  { value: 'other', label: 'Other', emoji: '\u{1F4CB}', icon: Package },
];

const CATEGORIES = [
  { value: 'produce', emoji: '\u{1F34E}' }, { value: 'dairy', emoji: '\u{1F95B}' },
  { value: 'meat', emoji: '\u{1F969}' }, { value: 'bakery', emoji: '\u{1F35E}' },
  { value: 'frozen', emoji: '\u{1F9CA}' }, { value: 'pantry', emoji: '\u{1F96B}' },
  { value: 'beverages', emoji: '\u{1F964}' }, { value: 'snacks', emoji: '\u{1F36A}' },
  { value: 'household', emoji: '\u{1F9F9}' }, { value: 'other', emoji: '\u{1F4E6}' },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000);
  return diff;
}

export default function PantryPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLoc, setFilterLoc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState('other');
  const [location, setLocation] = useState('pantry');
  const [expDate, setExpDate] = useState('');
  const [notes, setNotes] = useState('');

  const fetchItems = () => {
    const params = new URLSearchParams();
    if (filterLoc) params.append('location', filterLoc);
    if (search) params.append('search', search);
    api.get(`/pantry?${params}`).then(res => { setItems(res.data); setLoading(false); });
  };

  useEffect(() => { fetchItems(); }, [search, filterLoc]);

  const resetForm = () => { setName(''); setQuantity('1'); setCategory('other'); setLocation('pantry'); setExpDate(''); setNotes(''); setEditId(null); };

  const openEdit = (item) => {
    setName(item.name); setQuantity(item.quantity || '1'); setCategory(item.category);
    setLocation(item.location); setExpDate(item.expiration_date || ''); setNotes(item.notes || '');
    setEditId(item.id); setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = { name, quantity, category, location, expirationDate: expDate || null, notes };
    if (editId) { await api.put(`/pantry/${editId}`, body); }
    else { await api.post('/pantry', body); }
    resetForm(); setShowForm(false); fetchItems();
  };

  const toggleLowStock = async (id) => { await api.patch(`/pantry/${id}/low-stock`); fetchItems(); };
  const addToGrocery = async (id) => {
    const res = await api.post(`/pantry/${id}/to-grocery`);
    alert(res.data.message);
  };
  const handleDelete = async (id) => { await api.delete(`/pantry/${id}`); fetchItems(); };

  const byLocation = {};
  items.forEach(item => { if (!byLocation[item.location]) byLocation[item.location] = []; byLocation[item.location].push(item); });

  const lowStockCount = items.filter(i => i.low_stock).length;
  const expiringCount = items.filter(i => { const d = daysUntil(i.expiration_date); return d !== null && d <= 3; }).length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pantry</h1>
          <p className="text-sm text-slate-500">
            {items.length} items
            {lowStockCount > 0 && <span className="text-amber-500"> &middot; {lowStockCount} low stock</span>}
            {expiringCount > 0 && <span className="text-red-500"> &middot; {expiringCount} expiring soon</span>}
          </p>
        </div>
        {isParent && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={18} /> Add Item
          </button>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 text-sm" placeholder="Search pantry..." />
        </div>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} className="input-field text-sm w-auto">
          <option value="">All Locations</option>
          {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.emoji} {l.label}</option>)}
        </select>
      </div>

      {/* Items by location */}
      {items.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl mb-3 block">{'\u{1F3E0}'}</span>
          <p className="text-slate-500">{search || filterLoc ? 'No items found' : 'Pantry is empty'}</p>
          {isParent && !search && <p className="text-xs text-slate-400 mt-1">Add items to track what's in your fridge, freezer, and pantry</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {LOCATIONS.map(loc => {
            const locItems = byLocation[loc.value];
            if (!locItems) return null;
            return (
              <div key={loc.value}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span>{loc.emoji}</span>
                  <h3 className="text-sm font-semibold text-slate-600">{loc.label}</h3>
                  <span className="text-xs text-slate-400">({locItems.length})</span>
                </div>
                <div className="space-y-1">
                  {locItems.map(item => {
                    const daysLeft = daysUntil(item.expiration_date);
                    const expiring = daysLeft !== null && daysLeft <= 3;
                    const expired = daysLeft !== null && daysLeft < 0;
                    return (
                      <div key={item.id} className={`card flex items-center gap-3 py-3 ${expired ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : expiring ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : ''}`}>
                        {item.low_stock ? (
                          <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                            <AlertTriangle size={12} className="text-amber-600" />
                          </div>
                        ) : (
                          <span className="text-sm w-6 text-center shrink-0">{CATEGORIES.find(c => c.value === item.category)?.emoji || '\u{1F4E6}'}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-slate-400">
                            Qty: {item.quantity}
                            {item.expiration_date && (
                              <span className={expired ? 'text-red-500 font-medium' : expiring ? 'text-amber-500 font-medium' : ''}>
                                {' '}&middot; {expired ? `Expired ${Math.abs(daysLeft)}d ago` : expiring ? `Expires in ${daysLeft}d` : `Exp: ${item.expiration_date}`}
                              </span>
                            )}
                            {item.notes && <> &middot; {item.notes}</>}
                          </p>
                        </div>
                        {isParent && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => toggleLowStock(item.id)} title={item.low_stock ? 'Mark as stocked' : 'Mark as low'}
                              className={`p-1.5 transition-colors ${item.low_stock ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}>
                              <AlertTriangle size={14} />
                            </button>
                            <button onClick={() => addToGrocery(item.id)} title="Add to grocery list"
                              className="p-1.5 text-slate-300 hover:text-emerald-500 transition-colors">
                              <ShoppingCart size={14} />
                            </button>
                            <button onClick={() => openEdit(item)} className="p-1.5 text-slate-300 hover:text-family-500 transition-colors">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && isParent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editId ? 'Edit Item' : 'Add Pantry Item'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Item Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="e.g., Milk" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Quantity</label>
                  <input value={quantity} onChange={e => setQuantity(e.target.value)} className="input-field" placeholder="e.g., 2 gallons" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Expires</label>
                  <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="input-field text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Location</label>
                <div className="grid grid-cols-3 gap-2">
                  {LOCATIONS.filter(l => l.value !== 'other').map(l => (
                    <button key={l.value} type="button" onClick={() => setLocation(l.value)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm transition-all ${
                        location === l.value ? 'bg-family-100 ring-2 ring-family-400 dark:bg-family-900/30' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-700'
                      }`}>
                      <span>{l.emoji}</span> {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" placeholder="e.g., Opened on Monday" />
              </div>
              <button type="submit" className="btn-primary w-full">{editId ? 'Save Changes' : 'Add to Pantry'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

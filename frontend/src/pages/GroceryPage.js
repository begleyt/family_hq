import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import Avatar from '../components/common/Avatar';
import {
  Plus, Trash2, Check, X, Ticket, Archive, RotateCcw,
  ChevronDown, ChevronRight, Clock, ShoppingCart, Edit
} from 'lucide-react';

const GROCERY_CATEGORIES = [
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

const getCatInfo = (v) => GROCERY_CATEGORIES.find(c => c.value === v) || GROCERY_CATEGORIES[9];

export default function GroceryPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('other');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editCat, setEditCat] = useState('other');

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const suggestRef = useRef(null);

  // Archives
  const [showArchives, setShowArchives] = useState(false);
  const [archives, setArchives] = useState([]);
  const [archiveDetail, setArchiveDetail] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const fetchItems = () => {
    api.get('/grocery').then(res => { setItems(res.data); setLoading(false); });
  };

  useEffect(() => { fetchItems(); }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target) && e.target !== inputRef.current) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Autocomplete search
  const handleNameChange = async (val) => {
    setName(val);
    if (val.length >= 2 && isParent) {
      const res = await api.get(`/grocery/autocomplete?q=${encodeURIComponent(val)}`);
      setSuggestions(res.data);
      setShowSuggestions(res.data.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (s) => {
    setName(s.name);
    setCategory(s.category);
    setQuantity(s.quantity || '1');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('/grocery', { name, quantity: quantity || '1', category });
    setName(''); setQuantity(''); setCategory('other');
    setShowAdd(false);
    setShowSuggestions(false);
    fetchItems();
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    // If a suggestion was selected that had a category, use it
    const matchedSuggestion = suggestions.find(s => s.name.toLowerCase() === name.toLowerCase());
    await api.post('/grocery', {
      name,
      quantity: matchedSuggestion?.quantity || '1',
      category: matchedSuggestion?.category || 'other'
    });
    setName(''); setSuggestions([]); setShowSuggestions(false);
    fetchItems();
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditName(item.name);
    setEditQty(item.quantity);
    setEditCat(item.category);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    await api.put(`/grocery/${editItem.id}`, { name: editName, quantity: editQty, category: editCat });
    setEditItem(null);
    fetchItems();
  };

  const handleCheck = async (id) => {
    await api.patch(`/grocery/${id}/check`);
    fetchItems();
  };

  const handleOnHand = async (id) => {
    await api.patch(`/grocery/${id}/on-hand`);
    fetchItems();
  };

  const handleDelete = async (id) => {
    await api.delete(`/grocery/${id}`);
    fetchItems();
  };

  // Archive functions
  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await api.post('/grocery/archives', { label: '' });
      alert(res.data.message || 'List archived!');
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to archive');
    } finally { setArchiving(false); }
  };

  const loadArchives = async () => {
    const res = await api.get('/grocery/archives');
    setArchives(res.data);
    setShowArchives(true);
  };

  const loadArchiveDetail = async (id) => {
    const res = await api.get(`/grocery/archives/${id}`);
    setArchiveDetail(res.data);
  };

  const restoreAll = async (id) => {
    const res = await api.post(`/grocery/archives/${id}/restore`);
    alert(res.data.message);
    fetchItems();
  };

  const restoreItem = async (archiveId, item) => {
    await api.post(`/grocery/archives/${archiveId}/restore-item`, {
      name: item.name, quantity: item.quantity, category: item.category
    });
    fetchItems();
  };

  const needToBuy = items.filter(i => !i.is_checked && !i.on_hand);
  const onHand = items.filter(i => !i.is_checked && i.on_hand);
  const checked = items.filter(i => i.is_checked);

  const grouped = {};
  needToBuy.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Grocery List</h1>
          <p className="text-sm text-slate-500">{needToBuy.length} items to get{onHand.length > 0 ? `, ${onHand.length} on hand` : ''}</p>
        </div>
        {isParent && (
          <div className="flex items-center gap-2">
            <button onClick={loadArchives} className="btn-secondary text-sm flex items-center gap-1" title="Past Lists">
              <Clock size={14} /> Past Lists
            </button>
            {checked.length > 0 && (
              <button onClick={handleArchive} disabled={archiving}
                className="btn-primary text-sm flex items-center gap-1" title="Archive checked items & clear">
                <Archive size={14} /> Archive {checked.length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Parent: quick add with autocomplete | Kids: request prompt */}
      {isParent ? (
        <div className="relative mb-4">
          <form onSubmit={handleQuickAdd} className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                className="input-field"
                placeholder="Add an item..."
              />
              {showSuggestions && (
                <div ref={suggestRef} className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-100 z-30 max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button"
                      onClick={() => selectSuggestion(s)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-sm transition-colors">
                      <span>{getCatInfo(s.category).emoji}</span>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{s.quantity}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => { setShowAdd(true); setShowSuggestions(false); }} className="btn-secondary px-3" title="Add with details">
              <Plus size={18} />
            </button>
          </form>
        </div>
      ) : !isDashboard ? (
        <Link to="/requests?newCategory=grocery_item" className="card flex items-center gap-3 mb-4 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors">
          <Ticket size={20} className="text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">Want something added?</p>
            <p className="text-xs text-amber-600">Request a grocery item for parent approval</p>
          </div>
        </Link>
      ) : null}

      {/* Grouped Items */}
      {Object.keys(grouped).length === 0 && checked.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl mb-3 block">{'\u{1F6D2}'}</span>
          <p className="text-slate-500">The grocery list is empty</p>
          {isParent && archives.length === 0 && (
            <button onClick={loadArchives} className="btn-secondary mt-3 text-sm">Check past lists</button>
          )}
          {!isParent && !isDashboard && <p className="text-sm text-slate-400 mt-1">Submit a request to add items</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {GROCERY_CATEGORIES.map(cat => {
            const catItems = grouped[cat.value];
            if (!catItems) return null;
            return (
              <div key={cat.value}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span>{cat.emoji}</span>
                  <h3 className="text-sm font-semibold text-slate-600">{cat.label}</h3>
                  <span className="text-xs text-slate-400">({catItems.length})</span>
                </div>
                <div className="space-y-1">
                  {catItems.map(item => (
                    <div key={item.id} className="card flex items-center gap-3 py-3">
                      {isParent ? (
                        <button onClick={() => handleCheck(item.id)}
                          className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 transition-colors flex items-center justify-center shrink-0" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0 ml-2 mr-2" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          Qty: {item.quantity}
                          {item.requested_by_name
                            ? <> &middot; requested by <Avatar url={item.requested_by_avatar_url} emoji={item.requested_by_emoji} size="xs" className="inline-block align-middle mx-0.5" /> {item.requested_by_name}</>
                            : <> &middot; by {item.added_by_name}</>
                          }
                          {item.for_recipe && <> &middot; <span className="text-family-500">for {item.for_recipe}</span></>}
                        </p>
                      </div>
                      {isParent && (
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => handleOnHand(item.id)} title="Already have it" className="p-1.5 text-slate-300 hover:text-emerald-500 transition-colors">
                            <Check size={14} />
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
                  ))}
                </div>
              </div>
            );
          })}

          {onHand.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-sm">{'\u{1F3E0}'}</span>
                <h3 className="text-sm font-semibold text-emerald-600">Already Have ({onHand.length})</h3>
              </div>
              <div className="space-y-1">
                {onHand.map(item => (
                  <div key={item.id} className="card flex items-center gap-3 py-3 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30">
                    {isParent ? (
                      <button onClick={() => handleOnHand(item.id)} title="Move back to list"
                        className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 text-emerald-600">
                        {'\u{1F3E0}'}
                      </button>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-xs">{'\u{1F3E0}'}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-emerald-700 dark:text-emerald-300">{item.name}</p>
                      <p className="text-xs text-emerald-500/70">Qty: {item.quantity}{item.for_recipe && <> &middot; for {item.for_recipe}</>}</p>
                    </div>
                    {isParent && (
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {checked.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Check size={16} className="text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-400">Done ({checked.length})</h3>
              </div>
              <div className="space-y-1">
                {checked.map(item => (
                  <div key={item.id} className="card flex items-center gap-3 py-3 opacity-60">
                    {isParent ? (
                      <button onClick={() => handleCheck(item.id)}
                        className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                        <Check size={14} className="text-white" />
                      </button>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                        <Check size={14} className="text-white" />
                      </div>
                    )}
                    <p className="flex-1 text-sm line-through text-slate-400">{item.name}</p>
                    {isParent && (
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Add Modal (parent only) */}
      {showAdd && isParent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Grocery Item</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Item Name</label>
                <input value={name} onChange={e => handleNameChange(e.target.value)} className="input-field" placeholder="e.g., Milk" required />
                {showSuggestions && (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-100 mt-1 max-h-36 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} type="button" onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm">
                        <span>{getCatInfo(s.category).emoji}</span>
                        <span>{s.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{s.quantity}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Quantity</label>
                <input value={quantity} onChange={e => setQuantity(e.target.value)} className="input-field" placeholder="e.g., 2 gallons" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
                <div className="grid grid-cols-5 gap-2">
                  {GROCERY_CATEGORIES.map(c => (
                    <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all ${
                        category === c.value ? 'bg-family-100 ring-2 ring-family-400' : 'bg-slate-50 hover:bg-slate-100'
                      }`}>
                      <span className="text-lg">{c.emoji}</span>
                      <span className="truncate w-full text-center text-[10px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full">Add Item</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editItem && isParent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setEditItem(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Item</h2>
              <button onClick={() => setEditItem(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Quantity</label>
                <input value={editQty} onChange={e => setEditQty(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
                <div className="grid grid-cols-5 gap-2">
                  {GROCERY_CATEGORIES.map(c => (
                    <button key={c.value} type="button" onClick={() => setEditCat(c.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all ${
                        editCat === c.value ? 'bg-family-100 ring-2 ring-family-400 dark:bg-family-900/30' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600'
                      }`}>
                      <span className="text-lg">{c.emoji}</span>
                      <span className="truncate w-full text-center text-[10px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full">Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {/* Past Lists / Archives Modal */}
      {showArchives && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowArchives(false); setArchiveDetail(null); }} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {archiveDetail ? (
                  <>
                    <button onClick={() => setArchiveDetail(null)} className="p-1 rounded-lg hover:bg-slate-100">
                      <ChevronRight size={18} className="rotate-180" />
                    </button>
                    {archiveDetail.label}
                  </>
                ) : (
                  <><Clock size={20} /> Past Grocery Lists</>
                )}
              </h2>
              <button onClick={() => { setShowArchives(false); setArchiveDetail(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {archiveDetail ? (
              // Archive detail view
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{archiveDetail.item_count} items</p>
                  <button onClick={() => restoreAll(archiveDetail.id)} className="btn-primary text-sm flex items-center gap-1">
                    <RotateCcw size={14} /> Re-add All
                  </button>
                </div>
                <div className="space-y-1">
                  {archiveDetail.items?.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 px-3 bg-slate-50 rounded-xl">
                      <span className="text-sm">{getCatInfo(item.category).emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-slate-400">Qty: {item.quantity} &middot; {getCatInfo(item.category).label}</p>
                      </div>
                      <button onClick={() => restoreItem(archiveDetail.id, item)}
                        className="btn-secondary px-2 py-1 text-xs flex items-center gap-1">
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Archives list
              archives.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Archive size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No archived lists yet</p>
                  <p className="text-xs mt-1">Check off items and archive them after shopping</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archives.map(a => (
                    <button key={a.id} onClick={() => loadArchiveDetail(a.id)}
                      className="w-full card flex items-center gap-3 hover:shadow-md transition-shadow text-left">
                      <div className="w-10 h-10 rounded-xl bg-family-100 flex items-center justify-center">
                        <ShoppingCart size={18} className="text-family-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{a.label}</p>
                        <p className="text-xs text-slate-400">{a.item_count} items &middot; by {a.archived_by_name}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

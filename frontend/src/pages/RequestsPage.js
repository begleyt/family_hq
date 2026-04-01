import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import {
  Plus, X, Send, MessageSquare, Archive,
  CheckCircle2, XCircle, Clock, Calendar, MapPin, DollarSign
} from 'lucide-react';

const CATEGORIES = [
  { value: 'grocery_item', label: 'Grocery Item', emoji: '\u{1F6D2}' },
  { value: 'meal_request', label: 'Meal Idea', emoji: '\u{1F35D}' },
  { value: 'fix_something', label: 'Fix Something', emoji: '\u{1F527}' },
  { value: 'buy_something', label: 'Buy Something', emoji: '\u{1F6CD}\u{FE0F}' },
  { value: 'permission', label: 'Permission', emoji: '\u{1F511}' },
  { value: 'chore_negotiation', label: 'Chore Deal', emoji: '\u{1F91D}' },
  { value: 'allowance', label: 'Allowance', emoji: '\u{1F4B0}' },
  { value: 'ride_request', label: 'Ride Request', emoji: '\u{1F697}' },
  { value: 'tech_request', label: 'Tech Request', emoji: '\u{1F4F1}' },
  { value: 'other', label: 'Other', emoji: '\u{1F4CB}' },
];

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

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', emoji: '\u{1F373}' },
  { value: 'lunch', label: 'Lunch', emoji: '\u{1F96A}' },
  { value: 'dinner', label: 'Dinner', emoji: '\u{1F35D}' },
  { value: 'snack', label: 'Snack', emoji: '\u{1F34E}' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent!', color: 'bg-red-100 text-red-600' },
];

const STATUS_STYLE = {
  open: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700', denied: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-600',
};
const STATUS_LABEL = {
  open: 'Open', in_progress: 'In Progress', approved: 'Approved',
  denied: 'Denied', completed: 'Completed'
};

export default function RequestsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('normal');
  const [groceryCategory, setGroceryCategory] = useState('other');
  const [groceryQuantity, setGroceryQuantity] = useState('1');
  const [mealTypeRequested, setMealTypeRequested] = useState('dinner');
  const [rideTime, setRideTime] = useState('');
  const [rideDestination, setRideDestination] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [comment, setComment] = useState('');
  const [mealDate, setMealDate] = useState('');
  const [mealType, setMealType] = useState('dinner');
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [denyNote, setDenyNote] = useState('');
  const [showDenyForm, setShowDenyForm] = useState(false);

  // Auto-open form from URL param (e.g., /requests?newCategory=grocery_item)
  useEffect(() => {
    const newCat = searchParams.get('newCategory');
    if (newCat) {
      setCategory(newCat);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchRequests = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.append('status', filterStatus);
    if (filterCategory) params.append('category', filterCategory);
    if (showArchived) params.append('archived', '1');
    api.get(`/requests?${params}`).then(res => { setRequests(res.data); setLoading(false); });
  }, [filterStatus, filterCategory, showArchived]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const resetForm = () => {
    setTitle(''); setDescription(''); setCategory('other'); setPriority('normal');
    setGroceryCategory('other'); setGroceryQuantity('1'); setMealTypeRequested('dinner');
    setRideTime(''); setRideDestination(''); setAllowanceAmount('');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = { title, description, category, priority };
      if (category === 'grocery_item') {
        body.groceryCategory = groceryCategory;
        body.groceryQuantity = groceryQuantity;
      }
      if (category === 'meal_request') { body.mealTypeRequested = mealTypeRequested; }
      if (category === 'ride_request') { body.rideTime = rideTime; body.rideDestination = rideDestination; }
      if (category === 'allowance') { body.allowanceAmount = allowanceAmount; }
      await api.post('/requests', body);
      resetForm();
      setShowForm(false);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create request');
    } finally { setSubmitting(false); }
  };

  const archiveRequest = async (id) => {
    await api.patch(`/requests/${id}/archive`);
    fetchRequests();
    if (detail?.id === id) setDetail(null);
  };

  const archiveAllCompleted = async () => {
    const res = await api.post('/requests/archive-completed');
    alert(res.data.message);
    fetchRequests();
  };

  const handleStatusChange = async (id, status, extra = {}) => {
    await api.put(`/requests/${id}`, { status, ...extra });
    fetchRequests();
    if (detail?.id === id) loadDetail(id);
    setShowMealPicker(false); setShowDenyForm(false); setDenyNote('');
  };

  const loadDetail = async (id) => { const res = await api.get(`/requests/${id}`); setDetail(res.data); };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/requests/${detail.id}/comments`, { comment });
    setComment('');
    loadDetail(detail.id);
  };

  const handleApproveMeal = () => {
    if (!mealDate) return alert('Please select a date');
    handleStatusChange(detail.id, 'approved', { mealDate, mealType });
  };

  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';
  const getCategoryEmoji = (cat) => CATEGORIES.find(c => c.value === cat)?.emoji || '\u{1F4CB}';
  const getFormTitle = () => {
    if (category === 'grocery_item') return 'Request Grocery Item';
    if (category === 'meal_request') return 'Suggest a Meal';
    if (category === 'ride_request') return 'Request a Ride';
    if (category === 'allowance') return 'Allowance Request';
    return 'New Request';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Requests</h1>
        {!isDashboard && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={18} /> New Request
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm py-2 w-auto">
          <option value="">All Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field text-sm py-2 w-auto">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
        </select>
        {isParent && (
          <>
            <button onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${showArchived ? 'bg-family-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
              <Archive size={14} className="inline mr-1" />{showArchived ? 'Viewing Archived' : 'Archived'}
            </button>
            {!showArchived && (
              <button onClick={archiveAllCompleted} className="px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-700">
                Archive Done
              </button>
            )}
          </>
        )}
      </div>

      {/* Request List */}
      {requests.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl mb-3 block">{'\u{1F389}'}</span>
          <p className="text-slate-500">No requests found</p>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-secondary mt-3 text-sm">Create one!</button>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => (
            <div key={req.id} onClick={() => loadDetail(req.id)} className="card cursor-pointer hover:shadow-md transition-shadow flex items-center gap-3">
              <span className="text-2xl">{getCategoryEmoji(req.category)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{req.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {req.submitted_by_emoji} {req.submitted_by_name} &middot; {new Date(req.created_at + 'Z').toLocaleDateString()}
                  {req.ride_destination && <> &middot; to {req.ride_destination}</>}
                  {req.allowance_amount && <> &middot; ${req.allowance_amount}</>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge ${PRIORITIES.find(p => p.value === req.priority)?.color || ''}`}>{req.priority}</span>
                <span className={`badge ${STATUS_STYLE[req.status]}`}>{STATUS_LABEL[req.status]}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{getFormTitle()}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                      className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl text-[10px] transition-all ${
                        category === c.value ? 'bg-family-100 ring-2 ring-family-400' : 'bg-slate-50 hover:bg-slate-100'
                      }`}>
                      <span className="text-lg">{c.emoji}</span>
                      <span className="truncate w-full text-center leading-tight">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {category === 'grocery_item' ? 'Item Name' : category === 'meal_request' ? 'Meal Name' :
                   category === 'ride_request' ? 'Reason for Ride' : category === 'allowance' ? 'What is it for?' : 'What do you need?'}
                </label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input-field"
                  placeholder={
                    category === 'grocery_item' ? 'e.g., Chocolate Milk' :
                    category === 'meal_request' ? 'e.g., Tacos' :
                    category === 'ride_request' ? 'e.g., Soccer practice' :
                    category === 'allowance' ? 'e.g., New book' :
                    'e.g., Fix the bathroom faucet'
                  } required />
              </div>

              {/* Ride-specific fields */}
              {category === 'ride_request' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      <MapPin size={14} className="inline mr-1" />Where to?
                    </label>
                    <input value={rideDestination} onChange={e => setRideDestination(e.target.value)}
                      className="input-field" placeholder="e.g., Jake's house" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      <Clock size={14} className="inline mr-1" />When?
                    </label>
                    <input type="datetime-local" value={rideTime} onChange={e => setRideTime(e.target.value)}
                      className="input-field text-sm" />
                  </div>
                </div>
              )}

              {/* Allowance-specific fields */}
              {category === 'allowance' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    <DollarSign size={14} className="inline mr-1" />Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input value={allowanceAmount} onChange={e => setAllowanceAmount(e.target.value)}
                      className="input-field pl-7" placeholder="0.00" type="number" step="0.01" min="0" />
                  </div>
                </div>
              )}

              {/* Grocery-specific fields */}
              {category === 'grocery_item' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Quantity</label>
                    <input value={groceryQuantity} onChange={e => setGroceryQuantity(e.target.value)} className="input-field" placeholder="e.g., 2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Aisle</label>
                    <select value={groceryCategory} onChange={e => setGroceryCategory(e.target.value)} className="input-field">
                      {GROCERY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Meal-specific fields */}
              {category === 'meal_request' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Meal Type</label>
                  <div className="flex gap-2">
                    {MEAL_TYPES.map(t => (
                      <button key={t.value} type="button" onClick={() => setMealTypeRequested(t.value)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-sm transition-all ${
                          mealTypeRequested === t.value ? 'bg-family-100 ring-2 ring-family-400' : 'bg-slate-50 hover:bg-slate-100'
                        }`}><span>{t.emoji}</span> {t.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {category !== 'grocery_item' && category !== 'meal_request' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Priority</label>
                  <div className="flex gap-2">
                    {PRIORITIES.map(p => (
                      <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                          priority === p.value ? p.color + ' ring-2 ring-offset-1' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}>{p.label}</button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {category === 'meal_request' ? 'Why do you want this?' : 'Details'} (optional)
                </label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  className="input-field min-h-[80px] resize-none"
                  placeholder={category === 'meal_request' ? "It's my favorite!" : category === 'ride_request' ? 'Any extra details...' : 'Add more details...'} />
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Request Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setDetail(null); setShowMealPicker(false); setShowDenyForm(false); }} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto z-50">
            <div className="sticky top-0 bg-white p-5 pb-3 border-b border-slate-100 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCategoryEmoji(detail.category)}</span>
                  <h2 className="text-lg font-bold">{detail.title}</h2>
                </div>
                <button onClick={() => { setDetail(null); setShowMealPicker(false); setShowDenyForm(false); }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`badge ${STATUS_STYLE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
                <span className={`badge ${PRIORITIES.find(p => p.value === detail.priority)?.color || ''}`}>{detail.priority}</span>
                <span className="text-xs text-slate-400">by {detail.submitted_by_name}</span>
                {detail.category === 'grocery_item' && detail.grocery_category && (
                  <span className="badge bg-emerald-50 text-emerald-600">
                    {GROCERY_CATEGORIES.find(c => c.value === detail.grocery_category)?.emoji} {detail.grocery_quantity || '1'}
                  </span>
                )}
                {detail.category === 'meal_request' && detail.meal_type_requested && (
                  <span className="badge bg-blue-50 text-blue-600">
                    {MEAL_TYPES.find(t => t.value === detail.meal_type_requested)?.emoji} {detail.meal_type_requested}
                  </span>
                )}
                {detail.allowance_amount && (
                  <span className="badge bg-green-50 text-green-700">${detail.allowance_amount}</span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Ride details */}
              {detail.category === 'ride_request' && (detail.ride_destination || detail.ride_time) && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 flex flex-wrap gap-4">
                  {detail.ride_destination && (
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-blue-500" />
                      <div>
                        <p className="text-[10px] text-blue-500 font-medium uppercase">Destination</p>
                        <p className="text-sm font-medium text-slate-700">{detail.ride_destination}</p>
                      </div>
                    </div>
                  )}
                  {detail.ride_time && (
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-blue-500" />
                      <div>
                        <p className="text-[10px] text-blue-500 font-medium uppercase">When</p>
                        <p className="text-sm font-medium text-slate-700">{new Date(detail.ride_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Allowance amount */}
              {detail.category === 'allowance' && detail.allowance_amount && (
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 flex items-center gap-3">
                  <DollarSign size={20} className="text-green-600" />
                  <div>
                    <p className="text-[10px] text-green-600 font-medium uppercase">Amount Requested</p>
                    <p className="text-lg font-bold text-green-700">${detail.allowance_amount}</p>
                  </div>
                </div>
              )}

              {detail.description && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}

              {detail.parent_note && (
                <div className="bg-family-50 rounded-xl p-3 border border-family-100">
                  <p className="text-xs font-semibold text-family-600 mb-1">Parent Note</p>
                  <p className="text-sm text-slate-700">{detail.parent_note}</p>
                </div>
              )}

              {/* Parent Action Buttons */}
              {user.role === 'parent' && detail.status === 'open' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {detail.category === 'meal_request' ? (
                      <button onClick={() => { setShowMealPicker(true); setMealType(detail.meal_type_requested || 'dinner'); }}
                        className="btn-success flex-1 flex items-center justify-center gap-2 text-sm">
                        <CheckCircle2 size={16} /> Approve & Schedule
                      </button>
                    ) : (
                      <button onClick={() => handleStatusChange(detail.id, 'approved')}
                        className="btn-success flex-1 flex items-center justify-center gap-2 text-sm">
                        <CheckCircle2 size={16} /> Approve
                      </button>
                    )}
                    <button onClick={() => setShowDenyForm(true)}
                      className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm">
                      <XCircle size={16} /> Deny
                    </button>
                  </div>

                  {showMealPicker && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
                      <p className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                        <Calendar size={16} /> Pick a day for this meal
                      </p>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Date</label>
                        <input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Meal Slot</label>
                        <div className="flex gap-2">
                          {MEAL_TYPES.map(t => (
                            <button key={t.value} type="button" onClick={() => setMealType(t.value)}
                              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                                mealType === t.value ? 'bg-blue-200 text-blue-800' : 'bg-white text-slate-500'
                              }`}>{t.emoji} {t.label}</button>
                          ))}
                        </div>
                      </div>
                      <button onClick={handleApproveMeal} className="btn-success w-full text-sm">Approve & Add to Menu</button>
                    </div>
                  )}

                  {showDenyForm && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-100 space-y-3">
                      <p className="text-sm font-semibold text-red-700">Reason (optional)</p>
                      <input value={denyNote} onChange={e => setDenyNote(e.target.value)}
                        className="input-field text-sm" placeholder="e.g., We already have that" />
                      <div className="flex gap-2">
                        <button onClick={() => setShowDenyForm(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                        <button onClick={() => handleStatusChange(detail.id, 'denied', { parentNote: denyNote || null })}
                          className="btn-danger flex-1 text-sm">Deny Request</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {user.role === 'parent' && detail.status === 'in_progress' && (
                <div className="flex gap-2">
                  <button onClick={() => handleStatusChange(detail.id, 'completed')} className="btn-success flex-1 flex items-center justify-center gap-2 text-sm">
                    <CheckCircle2 size={16} /> Mark Complete
                  </button>
                </div>
              )}

              {/* Comments */}
              <div>
                <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2 mb-3">
                  <MessageSquare size={16} /> Comments ({detail.comments?.length || 0})
                </h3>
                <div className="space-y-2 mb-3">
                  {detail.comments?.map(c => (
                    <div key={c.id} className={`rounded-xl p-3 ${c.role === 'parent' ? 'bg-family-50 border border-family-100' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{c.avatar_emoji}</span>
                        <span className="text-xs font-semibold">{c.display_name}</span>
                        <span className="text-xs text-slate-400">{new Date(c.created_at + 'Z').toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600">{c.comment}</p>
                    </div>
                  ))}
                </div>
                {!isDashboard && (
                  <form onSubmit={handleComment} className="flex gap-2">
                    <input value={comment} onChange={e => setComment(e.target.value)}
                      className="input-field text-sm flex-1" placeholder="Add a comment..." />
                    <button type="submit" className="btn-primary px-3"><Send size={16} /></button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

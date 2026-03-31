import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink, Trash2, Ticket } from 'lucide-react';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', emoji: '\u{1F373}' },
  { value: 'lunch', label: 'Lunch', emoji: '\u{1F96A}' },
  { value: 'dinner', label: 'Dinner', emoji: '\u{1F35D}' },
  { value: 'snack', label: 'Snack', emoji: '\u{1F34E}' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDate(d) { return d.toISOString().split('T')[0]; }
function formatDateShort(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export default function MealPlannerPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recipeUrl, setRecipeUrl] = useState('');

  const fetchMeals = () => {
    api.get(`/meals?week=${formatDate(weekStart)}`).then(res => { setMeals(res.data.meals); setLoading(false); });
  };

  useEffect(() => { fetchMeals(); }, [weekStart]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  const getDays = () => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  const getMeal = (date, type) => {
    const dateStr = formatDate(date);
    return meals.find(m => m.meal_date === dateStr && m.meal_type === type);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post('/meals', { mealDate: showForm.date, mealType: showForm.mealType, title, description, recipeUrl });
    setTitle(''); setDescription(''); setRecipeUrl('');
    setShowForm(null);
    fetchMeals();
  };

  const handleDelete = async (id) => {
    await api.delete(`/meals/${id}`);
    fetchMeals();
  };

  const days = getDays();
  const today = formatDate(new Date());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Meal Planner</h1>
      </div>

      {/* Kids: request prompt */}
      {!isParent && !isDashboard && (
        <Link to="/requests?newCategory=meal_request" className="card flex items-center gap-3 mb-4 bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors">
          <Ticket size={20} className="text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-800">Have a meal idea?</p>
            <p className="text-xs text-blue-600">Suggest a meal for parent approval</p>
          </div>
        </Link>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4 card py-3">
        <button onClick={prevWeek} className="p-2 rounded-xl hover:bg-slate-100"><ChevronLeft size={20} /></button>
        <div className="text-center">
          <p className="font-semibold text-sm">{formatDateShort(weekStart)} - {formatDateShort(weekEnd)}</p>
          <button onClick={thisWeek} className="text-xs text-family-500 hover:text-family-600">Today</button>
        </div>
        <button onClick={nextWeek} className="p-2 rounded-xl hover:bg-slate-100"><ChevronRight size={20} /></button>
      </div>

      {/* Desktop Week View - Table Layout */}
      <div className="hidden md:block">
        <div className="card p-0 overflow-hidden">
          {/* Day header row */}
          <div className="grid grid-cols-[120px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-600">
            <div className="p-3" />
            {days.map((day, i) => {
              const isToday = formatDate(day) === today;
              return (
                <div key={i} className={`p-3 text-center border-l border-slate-100 dark:border-slate-700 ${isToday ? 'bg-family-50 dark:bg-family-900/30' : ''}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-family-600' : 'text-slate-400'}`}>{DAYS[i]}</p>
                  <p className={`text-xl font-bold mt-0.5 ${isToday ? 'text-family-600' : 'text-slate-700'}`}>{day.getDate()}</p>
                  <p className="text-[11px] text-slate-400">{formatDateShort(day)}</p>
                </div>
              );
            })}
          </div>

          {/* Meal type rows */}
          {MEAL_TYPES.map(type => (
            <div key={type.value} className="grid grid-cols-[120px_repeat(7,1fr)] border-b last:border-b-0 border-slate-100 dark:border-slate-700">
              {/* Meal type label */}
              <div className="p-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700">
                <span className="text-lg">{type.emoji}</span>
                <span className="text-sm font-semibold text-slate-600">{type.label}</span>
              </div>

              {/* Day cells */}
              {days.map((day, i) => {
                const dateStr = formatDate(day);
                const isToday = dateStr === today;
                const meal = getMeal(day, type.value);
                return (
                  <div key={i} className={`p-2 border-l border-slate-100 dark:border-slate-700 min-h-[72px] ${isToday ? 'bg-family-50/30 dark:bg-family-900/10' : ''}`}>
                    {meal ? (
                      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2.5 h-full group relative hover:shadow-md transition-shadow">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">{meal.title}</p>
                        {meal.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{meal.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {meal.recipe_url && (
                            <a href={meal.recipe_url} target="_blank" rel="noopener noreferrer"
                              className="text-family-500 hover:text-family-600 flex items-center gap-1 text-xs">
                              <ExternalLink size={12} /> Recipe
                            </a>
                          )}
                        </div>
                        {isParent && (
                          <button onClick={() => handleDelete(meal.id)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white dark:bg-slate-600 shadow opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ) : isParent ? (
                      <button onClick={() => setShowForm({ date: dateStr, mealType: type.value })}
                        className="w-full h-full min-h-[56px] flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600 hover:border-family-300 hover:bg-family-50/30 dark:hover:bg-family-900/10 transition-all group">
                        <span className="text-sm text-slate-300 group-hover:text-family-400">+ Add</span>
                      </button>
                    ) : (
                      <div className="w-full h-full min-h-[56px]" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Day View */}
      <div className="md:hidden space-y-3">
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const isToday = dateStr === today;
          const dayMeals = MEAL_TYPES.map(type => ({ type, meal: getMeal(day, type.value) }));

          return (
            <div key={i} className={`card ${isToday ? 'ring-2 ring-family-400' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isToday ? 'text-family-600' : 'text-slate-700'}`}>{DAYS[i]}</span>
                  <span className="text-sm text-slate-400">{formatDateShort(day)}</span>
                  {isToday && <span className="badge bg-family-100 text-family-600">Today</span>}
                </div>
              </div>
              <div className="space-y-1.5">
                {dayMeals.map(({ type, meal }) => (
                  <div key={type.value} className="flex items-center gap-2">
                    <span className="text-sm w-6">{type.emoji}</span>
                    {meal ? (
                      <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-sm font-medium flex-1 truncate">{meal.title}</span>
                        {meal.recipe_url && (
                          <a href={meal.recipe_url} target="_blank" rel="noopener noreferrer" className="text-family-500">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {isParent && (
                          <button onClick={() => handleDelete(meal.id)} className="text-slate-300 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ) : isParent ? (
                      <button onClick={() => setShowForm({ date: dateStr, mealType: type.value })}
                        className="flex-1 text-left text-sm text-slate-300 hover:text-family-400 px-3 py-2 bg-slate-50/50 hover:bg-slate-100 rounded-lg transition-colors">
                        + Add {type.label.toLowerCase()}
                      </button>
                    ) : (
                      <div className="flex-1 text-sm text-slate-200 px-3 py-2">-</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Meal Modal (parent only) */}
      {showForm && isParent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowForm(null)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {MEAL_TYPES.find(t => t.value === showForm.mealType)?.emoji}{' '}
                Add {MEAL_TYPES.find(t => t.value === showForm.mealType)?.label}
              </h2>
              <button onClick={() => setShowForm(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              {new Date(showForm.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">What's cooking?</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="e.g., Spaghetti & Meatballs" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Notes (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="e.g., Use grandma's recipe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Recipe Link (optional)</label>
                <input value={recipeUrl} onChange={e => setRecipeUrl(e.target.value)} className="input-field" placeholder="https://..." />
              </div>
              <button type="submit" className="btn-primary w-full">Add to Plan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

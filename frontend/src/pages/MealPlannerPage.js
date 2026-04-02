import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink, Trash2, Ticket, Clock, Users, BookOpen, ShoppingCart, Check } from 'lucide-react';

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

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateShort(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export default function MealPlannerPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(null);
  const [mealDetail, setMealDetail] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recipeUrl, setRecipeUrl] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedRecipeObj, setSelectedRecipeObj] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showGroceryPrompt, setShowGroceryPrompt] = useState(null);
  const [groceryIngredients, setGroceryIngredients] = useState([]);
  const [addingToGrocery, setAddingToGrocery] = useState(false);

  useEffect(() => { if (showForm && isParent) fetchRecipes(); }, [showForm]);

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

  const fetchRecipes = () => {
    api.get('/recipes').then(res => setRecipes(res.data)).catch(() => {});
  };

  const selectRecipe = (recipe) => {
    setTitle(recipe.title);
    setDescription(recipe.description || '');
    setRecipeUrl(recipe.source_url || '');
    setSelectedRecipeId(recipe.id);
    setSelectedRecipeObj(recipe);
    setRecipeSearch('');
  };

  const clearRecipe = () => {
    setSelectedRecipeId(null);
    setSelectedRecipeObj(null);
    setTitle(''); setDescription(''); setRecipeUrl('');
  };

  const parseIngredients = (recipe) => {
    const lines = (recipe.ingredients || '').split('\n').filter(l => l.trim());
    return lines.map(line => {
      const clean = line.replace(/^[-*•]\s*/, '').trim();
      const match = clean.match(/^([\d½¼¾⅓⅔/.\s]+(?:cup|cups|lb|lbs|oz|tsp|tbsp|gallon|gallons|can|cans|pkg|bunch|head|clove|cloves|piece|pieces)?s?)\s+(.+)$/i);
      if (match) return { name: match[2].trim(), quantity: match[1].trim(), include: true };
      return { name: clean, quantity: '1', include: true };
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post('/meals', { mealDate: showForm.date, mealType: showForm.mealType, title, description, recipeUrl, recipeId: selectedRecipeId });

    // If a recipe with ingredients was selected, prompt to add to grocery
    if (selectedRecipeObj && selectedRecipeObj.ingredients) {
      const parsed = parseIngredients(selectedRecipeObj);
      if (parsed.length > 0) {
        // Check pantry for items we already have
        try {
          const pantryCheck = await api.post('/grocery/check-pantry', { items: parsed });
          const checked = pantryCheck.data.map(i => ({ ...i, include: !i.inPantry }));
          setGroceryIngredients(checked);
        } catch (e) {
          setGroceryIngredients(parsed);
        }
        setShowGroceryPrompt(selectedRecipeObj.title);
      }
    }

    setTitle(''); setDescription(''); setRecipeUrl(''); setSelectedRecipeId(null); setSelectedRecipeObj(null); setRecipeSearch('');
    setShowForm(null);
    fetchMeals();
  };

  const handleAddToGrocery = async () => {
    const items = groceryIngredients.filter(i => i.include && i.name.trim());
    if (items.length === 0) { setShowGroceryPrompt(null); return; }
    setAddingToGrocery(true);
    try {
      const res = await api.post('/grocery/from-recipe', { items, recipeName: showGroceryPrompt });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add');
    } finally {
      setAddingToGrocery(false);
      setShowGroceryPrompt(null);
      setGroceryIngredients([]);
    }
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
                      <div onClick={() => setMealDetail(meal)} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-2.5 h-full group relative hover:shadow-md transition-shadow cursor-pointer">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">{meal.title}</p>
                        {meal.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{meal.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {meal.recipe_id && <span className="text-[10px] text-family-500 flex items-center gap-0.5"><BookOpen size={10} /> Recipe</span>}
                          {meal.recipe_url && !meal.recipe_id && (
                            <a href={meal.recipe_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              className="text-family-500 hover:text-family-600 flex items-center gap-1 text-xs">
                              <ExternalLink size={12} /> Link
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
                      <div onClick={() => setMealDetail(meal)} className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-100 transition-colors">
                        <span className="text-sm font-medium flex-1 truncate">{meal.title}</span>
                        {meal.recipe_id && <BookOpen size={14} className="text-family-400 shrink-0" />}
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
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {MEAL_TYPES.find(t => t.value === showForm.mealType)?.emoji}{' '}
                Add {MEAL_TYPES.find(t => t.value === showForm.mealType)?.label}
              </h2>
              <button onClick={() => setShowForm(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              {new Date(showForm.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* Recipe Picker */}
            {recipes.length > 0 && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <BookOpen size={14} /> Pick from Recipe Book
                </label>
                {selectedRecipeId ? (
                  <div className="flex items-center gap-2 p-2.5 bg-family-50 dark:bg-family-900/30 rounded-xl border border-family-200 dark:border-family-800">
                    <BookOpen size={16} className="text-family-500 shrink-0" />
                    <span className="text-sm font-medium flex-1">{title}</span>
                    <button type="button" onClick={clearRecipe} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)}
                      className="input-field text-sm" placeholder="Search recipes..." />
                    {recipeSearch && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-700 rounded-xl shadow-lg border border-slate-100 dark:border-slate-600 z-10 max-h-40 overflow-y-auto">
                        {recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase())).length === 0 ? (
                          <p className="p-3 text-xs text-slate-400">No matching recipes</p>
                        ) : (
                          recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase())).map(r => (
                            <button key={r.id} type="button" onClick={() => selectRecipe(r)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 text-sm transition-colors">
                              <BookOpen size={14} className="text-family-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{r.title}</span>
                                {r.tags && <span className="text-[10px] text-slate-400 ml-2">{r.tags}</span>}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-600" />
                  <span className="text-xs text-slate-400">or enter manually</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-600" />
                </div>
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">What's cooking?</label>
                <input value={title} onChange={e => { setTitle(e.target.value); if (selectedRecipeId) setSelectedRecipeId(null); }} className="input-field" placeholder="e.g., Spaghetti & Meatballs" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Notes (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="e.g., Use grandma's recipe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Recipe Link (optional)</label>
                <input value={recipeUrl} onChange={e => setRecipeUrl(e.target.value)} className="input-field" placeholder="https://..." />
              </div>
              <button type="submit" className="btn-primary w-full">Add to Plan</button>
            </form>
          </div>
        </div>
      )}

      {/* Meal Detail Modal */}
      {mealDetail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMealDetail(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto z-50">
            <div className="sticky top-0 bg-white dark:bg-slate-800 p-5 pb-3 border-b border-slate-100 dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{mealDetail.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">
                    {mealDetail.meal_type} &middot; {new Date(mealDetail.meal_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <button onClick={() => setMealDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {mealDetail.description && (
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">{mealDetail.description}</p>
                </div>
              )}

              {mealDetail.recipe_url && !mealDetail.recipe_id && (
                <a href={mealDetail.recipe_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2 w-fit">
                  <ExternalLink size={14} /> View Recipe Link
                </a>
              )}

              {/* Linked Recipe */}
              {mealDetail.recipe_id && (
                <div className="border border-family-200 dark:border-family-800 rounded-xl overflow-hidden">
                  <div className="bg-family-50 dark:bg-family-900/30 px-4 py-2.5 flex items-center gap-2">
                    <BookOpen size={16} className="text-family-500" />
                    <span className="text-sm font-semibold text-family-700 dark:text-family-300">{mealDetail.recipe_title}</span>
                  </div>

                  {mealDetail.recipe_description && (
                    <p className="px-4 pt-3 text-sm text-slate-500">{mealDetail.recipe_description}</p>
                  )}

                  <div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-slate-400">
                    {mealDetail.recipe_prep_time && <span className="flex items-center gap-1"><Clock size={12} /> Prep: {mealDetail.recipe_prep_time}</span>}
                    {mealDetail.recipe_cook_time && <span className="flex items-center gap-1"><Clock size={12} /> Cook: {mealDetail.recipe_cook_time}</span>}
                    {mealDetail.recipe_servings && <span className="flex items-center gap-1"><Users size={12} /> Serves {mealDetail.recipe_servings}</span>}
                  </div>

                  {mealDetail.recipe_ingredients && (
                    <div className="px-4 pb-3">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Ingredients</h4>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-slate-100 dark:border-slate-600">
                        {mealDetail.recipe_ingredients.split('\n').filter(l => l.trim()).map((line, i) => (
                          <p key={i} className="text-xs text-slate-600 dark:text-slate-300 py-0.5">{line.startsWith('-') ? line : `- ${line}`}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {mealDetail.recipe_instructions && (
                    <div className="px-4 pb-3">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Instructions</h4>
                      <div className="space-y-1.5">
                        {mealDetail.recipe_instructions.split('\n').filter(l => l.trim()).map((line, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="w-5 h-5 rounded-full bg-family-100 dark:bg-family-900/30 text-family-600 text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{line.replace(/^\d+[\.\)]\s*/, '')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {mealDetail.recipe_source_url && (
                    <div className="px-4 pb-3">
                      <a href={mealDetail.recipe_source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-family-500 hover:text-family-600 flex items-center gap-1">
                        <ExternalLink size={12} /> View Original Recipe
                      </a>
                    </div>
                  )}

                  {mealDetail.recipe_tags && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1">
                      {mealDetail.recipe_tags.split(',').map((t, i) => (
                        <span key={i} className="badge bg-family-100 text-family-600 dark:bg-family-900/30 dark:text-family-300 text-[10px]">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!mealDetail.recipe_id && !mealDetail.recipe_url && !mealDetail.description && (
                <p className="text-sm text-slate-400 text-center py-4">No additional details for this meal</p>
              )}

              {isParent && (
                <button onClick={() => { handleDelete(mealDetail.id); setMealDetail(null); }}
                  className="btn-danger w-full text-sm flex items-center justify-center gap-2">
                  <Trash2 size={14} /> Remove from Planner
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grocery Prompt after adding meal with recipe */}
      {showGroceryPrompt && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowGroceryPrompt(null); setGroceryIngredients([]); }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShoppingCart size={20} /> Add Ingredients?
              </h2>
              <button onClick={() => { setShowGroceryPrompt(null); setGroceryIngredients([]); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Want to add ingredients from <span className="font-medium text-slate-700 dark:text-slate-200">{showGroceryPrompt}</span> to your grocery list?
            </p>
            <div className="space-y-1.5 mb-4 max-h-60 overflow-y-auto">
              {groceryIngredients.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${item.include ? 'bg-slate-50 dark:bg-slate-700' : 'opacity-40'}`}>
                  <button onClick={() => {
                    const u = [...groceryIngredients]; u[i] = { ...u[i], include: !u[i].include }; setGroceryIngredients(u);
                  }} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${item.include ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {item.include && <Check size={12} className="text-white" />}
                  </button>
                  <input value={item.quantity} onChange={e => { const u = [...groceryIngredients]; u[i] = { ...u[i], quantity: e.target.value }; setGroceryIngredients(u); }}
                    className="w-16 input-field text-xs py-1 px-2 text-center" />
                  <input value={item.name} onChange={e => { const u = [...groceryIngredients]; u[i] = { ...u[i], name: e.target.value }; setGroceryIngredients(u); }}
                    className="flex-1 input-field text-xs py-1 px-2" />
                  {item.inPantry && <span className="text-[10px] text-emerald-500 whitespace-nowrap">{'\u{1F3E0}'} have it</span>}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mb-3">{groceryIngredients.filter(i => i.include).length} items selected. Duplicates will be skipped.</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowGroceryPrompt(null); setGroceryIngredients([]); }} className="btn-secondary flex-1">No Thanks</button>
              <button onClick={handleAddToGrocery} disabled={addingToGrocery} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <ShoppingCart size={16} /> {addingToGrocery ? 'Adding...' : 'Add to List'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

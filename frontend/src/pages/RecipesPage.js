import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { Plus, X, Search, ChefHat, Clock, Users, Tag, ExternalLink, Edit, Trash2, Star, ShoppingCart, Check, CalendarDays } from 'lucide-react';
import Avatar from '../components/common/Avatar';

export default function RecipesPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [favUsers, setFavUsers] = useState([]);
  const [showGroceryAdd, setShowGroceryAdd] = useState(false);
  const [groceryIngredients, setGroceryIngredients] = useState([]);
  const [addingToGrocery, setAddingToGrocery] = useState(false);
  const [showMealAdd, setShowMealAdd] = useState(null); // recipe object
  const [mealDate, setMealDate] = useState('');
  const [mealType, setMealType] = useState('dinner');
  const isDashboard = user.role === 'dashboard';

  const MEAL_TYPES = [
    { value: 'breakfast', label: 'Breakfast', emoji: '\u{1F373}' },
    { value: 'lunch', label: 'Lunch', emoji: '\u{1F96A}' },
    { value: 'dinner', label: 'Dinner', emoji: '\u{1F35D}' },
    { value: 'snack', label: 'Snack', emoji: '\u{1F34E}' },
  ];

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [tags, setTags] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const fetchRecipes = () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get(`/recipes${params}`).then(res => { setRecipes(res.data); setLoading(false); });
  };

  useEffect(() => { fetchRecipes(); }, [search]);

  const resetForm = () => {
    setTitle(''); setDescription(''); setIngredients(''); setInstructions('');
    setPrepTime(''); setCookTime(''); setServings(''); setTags(''); setSourceUrl('');
    setEditId(null);
  };

  const openEdit = (r) => {
    setTitle(r.title); setDescription(r.description || ''); setIngredients(r.ingredients || '');
    setInstructions(r.instructions || ''); setPrepTime(r.prep_time || ''); setCookTime(r.cook_time || '');
    setServings(r.servings || ''); setTags(r.tags || ''); setSourceUrl(r.source_url || '');
    setEditId(r.id); setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = { title, description, ingredients, instructions, prepTime, cookTime, servings, tags, sourceUrl };
    if (editId) {
      await api.put(`/recipes/${editId}`, body);
    } else {
      await api.post('/recipes', body);
    }
    resetForm(); setShowForm(false); fetchRecipes();
  };

  const toggleFavorite = async (id, e) => {
    if (e) e.stopPropagation();
    await api.post(`/recipes/${id}/favorite`);
    fetchRecipes();
    if (detail?.id === id) loadFavUsers(id);
  };

  const loadFavUsers = async (id) => {
    const res = await api.get(`/recipes/${id}/favorites`);
    setFavUsers(res.data);
  };

  const openGroceryAdd = (recipe) => {
    // Parse ingredients into editable list
    const lines = (recipe.ingredients || '').split('\n').filter(l => l.trim());
    setGroceryIngredients(lines.map(line => {
      const clean = line.replace(/^[-*•]\s*/, '').trim();
      // Try to split quantity from name (e.g., "2 cups flour" -> qty:"2 cups", name:"flour")
      const match = clean.match(/^([\d½¼¾⅓⅔/.\s]+(?:cup|cups|lb|lbs|oz|tsp|tbsp|gallon|gallons|can|cans|pkg|bunch|head|clove|cloves|piece|pieces)?s?)\s+(.+)$/i);
      if (match) return { name: match[2].trim(), quantity: match[1].trim(), include: true };
      return { name: clean, quantity: '1', include: true };
    }));
    setShowGroceryAdd(true);
  };

  const handleAddToGrocery = async () => {
    const items = groceryIngredients.filter(i => i.include && i.name.trim());
    if (items.length === 0) return;
    setAddingToGrocery(true);
    try {
      const res = await api.post('/grocery/from-recipe', { items, recipeName: detail.title });
      alert(res.data.message);
      setShowGroceryAdd(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add');
    } finally { setAddingToGrocery(false); }
  };

  const handleAddToMeal = async (e) => {
    e.preventDefault();
    if (!mealDate) return alert('Please select a date');
    await api.post('/meals', { mealDate, mealType, title: showMealAdd.title, description: showMealAdd.description || '', recipeId: showMealAdd.id });
    const recipe = showMealAdd;
    setShowMealAdd(null); setMealDate(''); setMealType('dinner');

    // Prompt to add ingredients to grocery if recipe has them
    if (recipe.ingredients) {
      const parsed = (recipe.ingredients || '').split('\n').filter(l => l.trim()).map(line => {
        const clean = line.replace(/^[-*•]\s*/, '').trim();
        const match = clean.match(/^([\d½¼¾⅓⅔/.\s]+(?:cup|cups|lb|lbs|oz|tsp|tbsp|gallon|gallons|can|cans|pkg|bunch|head|clove|cloves|piece|pieces)?s?)\s+(.+)$/i);
        if (match) return { name: match[2].trim(), quantity: match[1].trim(), include: true };
        return { name: clean, quantity: '1', include: true };
      });
      if (parsed.length > 0) {
        setGroceryIngredients(parsed);
        setShowGroceryAdd(true);
      }
    }
    alert(`Added "${recipe.title}" to ${mealType} on ${mealDate}`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recipe?')) return;
    await api.delete(`/recipes/${id}`);
    setDetail(null); fetchRecipes();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Recipe Book</h1>
        {isParent && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={18} /> Add Recipe
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-10" placeholder="Search recipes, ingredients, tags..." />
      </div>

      {/* Recipe Grid */}
      {recipes.length === 0 ? (
        <div className="card text-center py-12">
          <ChefHat size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">{search ? 'No recipes found' : 'Recipe book is empty'}</p>
          {isParent && !search && <p className="text-xs text-slate-400 mt-1">Add recipes manually or ask the AI assistant to create them!</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map(r => (
            <div key={r.id} onClick={() => { setDetail(r); loadFavUsers(r.id); }} className="card cursor-pointer hover:shadow-md transition-shadow relative">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm mb-1 flex-1">{r.title}</h3>
                {!isDashboard && (
                  <button onClick={(e) => toggleFavorite(r.id, e)} className="p-1 -mt-0.5 -mr-1 shrink-0">
                    <Star size={16} className={r.is_favorited ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-400'} />
                  </button>
                )}
              </div>
              {r.favorite_count > 0 && <p className="text-[10px] text-amber-500 mb-1">{'\u{2B50}'} {r.favorite_count} favorite{r.favorite_count > 1 ? 's' : ''}</p>}
              {r.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{r.description}</p>}
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                {r.prep_time && <span className="flex items-center gap-1"><Clock size={12} /> Prep: {r.prep_time}</span>}
                {r.cook_time && <span className="flex items-center gap-1"><Clock size={12} /> Cook: {r.cook_time}</span>}
                {r.servings && <span className="flex items-center gap-1"><Users size={12} /> {r.servings}</span>}
              </div>
              {r.tags && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.tags.split(',').map((t, i) => (
                    <span key={i} className="badge bg-family-100 text-family-600 dark:bg-family-900/30 dark:text-family-300 text-[10px]">{t.trim()}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDetail(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto z-50">
            <div className="sticky top-0 bg-white dark:bg-slate-800 p-5 pb-3 border-b border-slate-100 dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{detail.title}</h2>
                <div className="flex items-center gap-1">
                  {isParent && <button onClick={() => { openEdit(detail); setDetail(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><Edit size={16} /></button>}
                  {isParent && <button onClick={() => handleDelete(detail.id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-red-400"><Trash2 size={16} /></button>}
                  <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
                </div>
              </div>
              {detail.description && <p className="text-sm text-slate-500 mt-1">{detail.description}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
                {detail.prep_time && <span className="flex items-center gap-1"><Clock size={12} /> Prep: {detail.prep_time}</span>}
                {detail.cook_time && <span className="flex items-center gap-1"><Clock size={12} /> Cook: {detail.cook_time}</span>}
                {detail.servings && <span className="flex items-center gap-1"><Users size={12} /> Serves {detail.servings}</span>}
              </div>
            </div>
            <div className="p-5 space-y-4">
              {detail.ingredients && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Ingredients</h3>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                    {detail.ingredients.split('\n').map((line, i) => (
                      <p key={i} className="text-sm text-slate-600 dark:text-slate-300 py-0.5">{line.startsWith('-') ? line : `- ${line}`}</p>
                    ))}
                  </div>
                </div>
              )}
              {detail.instructions && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Instructions</h3>
                  <div className="space-y-2">
                    {detail.instructions.split('\n').filter(l => l.trim()).map((line, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-family-100 dark:bg-family-900/30 text-family-600 text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{line.replace(/^\d+[\.\)]\s*/, '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {detail.source_url && (
                  <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2">
                    <ExternalLink size={14} /> View Original
                  </a>
                )}
                {isParent && (
                  <button onClick={() => { setShowMealAdd(detail); setMealDate(''); setMealType('dinner'); }} className="btn-primary text-sm flex items-center gap-2">
                    <CalendarDays size={14} /> Add to Meal Plan
                  </button>
                )}
                {isParent && detail.ingredients && (
                  <button onClick={() => openGroceryAdd(detail)} className="btn-secondary text-sm flex items-center gap-2">
                    <ShoppingCart size={14} /> Add to Grocery List
                  </button>
                )}
              </div>
              )}
              {detail.tags && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.split(',').map((t, i) => (
                    <span key={i} className="badge bg-family-100 text-family-600 dark:bg-family-900/30 dark:text-family-300">{t.trim()}</span>
                  ))}
                </div>
              )}

              {/* Favorites */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                {!isDashboard && (
                  <button onClick={() => toggleFavorite(detail.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                      detail.is_favorited ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-amber-500'
                    }`}>
                    <Star size={16} className={detail.is_favorited ? 'fill-amber-400 text-amber-400' : ''} />
                    {detail.is_favorited ? 'Favorited' : 'Favorite'}
                  </button>
                )}
                {favUsers.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-1">Loved by:</span>
                    {favUsers.map((f, i) => (
                      <Avatar key={i} url={f.avatar_url} emoji={f.avatar_emoji} size="xs" className="ring-2 ring-white dark:ring-slate-800 -ml-1 first:ml-0" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {/* Add Ingredients to Grocery Modal */}
      {/* Add to Meal Plan Modal */}
      {showMealAdd && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowMealAdd(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CalendarDays size={20} /> Add to Meal Plan
              </h2>
              <button onClick={() => setShowMealAdd(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Schedule <span className="font-medium text-slate-700 dark:text-slate-200">{showMealAdd.title}</span>
            </p>
            <form onSubmit={handleAddToMeal} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Date</label>
                <input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Meal</label>
                <div className="flex gap-2">
                  {MEAL_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setMealType(t.value)}
                      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-sm transition-all ${
                        mealType === t.value ? 'bg-family-100 ring-2 ring-family-400 dark:bg-family-900/30' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-700'
                      }`}>{t.emoji} {t.label}</button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full">Add to Plan</button>
            </form>
          </div>
        </div>
      )}

      {showGroceryAdd && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowGroceryAdd(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShoppingCart size={20} /> Add to Grocery List
              </h2>
              <button onClick={() => setShowGroceryAdd(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Ingredients from <span className="font-medium text-slate-700 dark:text-slate-200">{detail?.title}</span> — uncheck items you don't need, edit names or quantities.
            </p>
            <div className="space-y-1.5 mb-4">
              {groceryIngredients.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${item.include ? 'bg-slate-50 dark:bg-slate-700' : 'bg-slate-50/50 dark:bg-slate-700/50 opacity-50'}`}>
                  <button onClick={() => {
                    const updated = [...groceryIngredients];
                    updated[i] = { ...updated[i], include: !updated[i].include };
                    setGroceryIngredients(updated);
                  }} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${item.include ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {item.include && <Check size={12} className="text-white" />}
                  </button>
                  <input value={item.quantity} onChange={e => {
                    const updated = [...groceryIngredients];
                    updated[i] = { ...updated[i], quantity: e.target.value };
                    setGroceryIngredients(updated);
                  }} className="w-16 input-field text-xs py-1 px-2 text-center" />
                  <input value={item.name} onChange={e => {
                    const updated = [...groceryIngredients];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setGroceryIngredients(updated);
                  }} className="flex-1 input-field text-xs py-1 px-2" />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {groceryIngredients.filter(i => i.include).length} of {groceryIngredients.length} items selected. Duplicates already on the list will be skipped.
            </p>
            <button onClick={handleAddToGrocery} disabled={addingToGrocery} className="btn-primary w-full flex items-center justify-center gap-2">
              <ShoppingCart size={16} /> {addingToGrocery ? 'Adding...' : 'Add Selected to Grocery List'}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editId ? 'Edit Recipe' : 'New Recipe'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Recipe Name</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="e.g., Grandma's Meatloaf" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Description</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Short description..." />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Prep Time</label>
                  <input value={prepTime} onChange={e => setPrepTime(e.target.value)} className="input-field text-sm" placeholder="15 min" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Cook Time</label>
                  <input value={cookTime} onChange={e => setCookTime(e.target.value)} className="input-field text-sm" placeholder="30 min" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Servings</label>
                  <input value={servings} onChange={e => setServings(e.target.value)} className="input-field text-sm" placeholder="4" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Ingredients (one per line)</label>
                <textarea value={ingredients} onChange={e => setIngredients(e.target.value)}
                  className="input-field min-h-[100px] resize-none text-sm" placeholder="1 lb ground beef&#10;1 cup breadcrumbs&#10;2 eggs..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Instructions (one step per line)</label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                  className="input-field min-h-[100px] resize-none text-sm" placeholder="Preheat oven to 350F&#10;Mix ingredients in a bowl&#10;Shape into a loaf..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Tags (comma-separated)</label>
                <input value={tags} onChange={e => setTags(e.target.value)} className="input-field" placeholder="beef, comfort food, easy" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Source URL (optional)</label>
                <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} className="input-field" placeholder="https://..." />
              </div>
              <button type="submit" className="btn-primary w-full">{editId ? 'Save Changes' : 'Add Recipe'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

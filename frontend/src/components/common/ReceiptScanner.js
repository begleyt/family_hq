import React, { useState, useRef } from 'react';
import api from '../../api';
import { Receipt, Camera, X, Check, Loader2, ShoppingCart, Package } from 'lucide-react';

export default function ReceiptScanner({ onComplete }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [addToPantry, setAddToPantry] = useState(true);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const img = new window.Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const max = 1200;
      let w = img.width, h = img.height;
      if (w > max) { h = (h * max) / w; w = max; }
      if (h > max) { w = (w * max) / h; h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      setPreview(canvas.toDataURL('image/jpeg', 0.8));
      setScanning(true);
      setResult(null);

      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          try {
            const res = await api.post('/walmart/scan-receipt', {
              imageData: { base64, mediaType: 'image/jpeg' },
            });
            setResult(res.data);
          } catch (err) {
            alert(err.response?.data?.error || 'Scan failed');
            setPreview(null);
          } finally {
            setScanning(false);
          }
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleApply = async () => {
    if (!result?.items?.length) return;
    setProcessing(true);
    try {
      const res = await api.post('/walmart/receipt-checklist', {
        items: result.items,
        addToPantry,
      });
      alert(res.data.message);
      if (onComplete) onComplete();
      close();
    } catch (e) {
      alert('Failed to process');
    } finally { setProcessing(false); }
  };

  const close = () => { setPreview(null); setResult(null); setScanning(false); };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
      <button onClick={() => inputRef.current?.click()} className="btn-secondary text-sm flex items-center gap-1">
        <Receipt size={14} /> Scan Receipt
      </button>

      {/* Receipt Scanner Modal */}
      {(preview || result) && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={close} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto z-50">
            <div className="sticky top-0 bg-white dark:bg-slate-800 p-4 pb-2 border-b border-slate-100 dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Receipt size={20} /> {scanning ? 'Scanning Receipt...' : result ? `${result.store}` : 'Receipt Scanner'}
                </h2>
                <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
              </div>
              {result && (
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>{result.date}</span>
                  <span>{result.items?.length} items</span>
                  {result.total && <span className="font-semibold text-slate-700 dark:text-slate-200">Total: ${result.total.toFixed(2)}</span>}
                  {result.tax && <span>Tax: ${result.tax.toFixed(2)}</span>}
                </div>
              )}
            </div>

            <div className="p-4">
              {scanning && (
                <div className="text-center py-6">
                  <img src={preview} alt="Receipt" className="max-h-32 mx-auto rounded-lg mb-3 opacity-50" />
                  <div className="flex items-center justify-center gap-2 text-family-600">
                    <Loader2 size={18} className="animate-spin" />
                    <p className="text-sm font-medium">Reading receipt...</p>
                  </div>
                </div>
              )}

              {result && result.items && (
                <>
                  <div className="space-y-1 mb-4">
                    {result.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          {item.quantity > 1 && <span className="text-xs text-slate-400">x{item.quantity}</span>}
                        </div>
                        <span className="text-sm font-semibold text-emerald-600 ml-2">${item.price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={addToPantry} onChange={e => setAddToPantry(e.target.checked)} className="rounded" />
                      <Package size={14} /> Also add items to pantry inventory
                    </label>

                    <div className="flex gap-2">
                      <button onClick={close} className="btn-secondary flex-1">Cancel</button>
                      <button onClick={handleApply} disabled={processing} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {processing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {processing ? 'Processing...' : 'Record Prices & Check Off'}
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center">
                      Prices saved to history. Matching grocery items checked off.
                      {addToPantry && ' Items added to pantry with auto-detected locations.'}
                    </p>
                  </div>
                </>
              )}

              {result && (!result.items || result.items.length === 0) && (
                <div className="text-center py-6">
                  <p className="text-slate-500">Couldn't read any items from the receipt.</p>
                  <p className="text-xs text-slate-400 mt-1">Try a clearer photo with good lighting.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

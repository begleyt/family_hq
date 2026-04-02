import React, { useState, useRef } from 'react';
import api from '../../api';
import { Tag, X, Loader2, Camera } from 'lucide-react';

export default function PriceTagScanner({ onPriceFound }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const img = new window.Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const max = 1024;
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
            const res = await api.post('/walmart/scan-price-tag', {
              imageData: { base64, mediaType: 'image/jpeg' },
            });
            setResult(res.data);
          } catch (err) {
            alert(err.response?.data?.error || 'Scan failed');
            setPreview(null);
          } finally { setScanning(false); }
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  };

  const close = () => { setPreview(null); setResult(null); setScanning(false); };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      <button onClick={() => inputRef.current?.click()} className="btn-secondary text-sm flex items-center gap-1" title="Scan Price Tag">
        <Tag size={14} /> <span className="hidden sm:inline">Price Tag</span>
      </button>

      {(preview || result) && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={close} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Tag size={20} /> {scanning ? 'Reading...' : 'Price Tag'}
              </h2>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>

            {scanning && (
              <div className="text-center py-4">
                <img src={preview} alt="Tag" className="max-h-32 mx-auto rounded-lg mb-3 opacity-50" />
                <Loader2 size={20} className="animate-spin mx-auto text-family-500" />
                <p className="text-sm text-slate-500 mt-2">Reading price tag...</p>
              </div>
            )}

            {result && !scanning && (
              <div className="space-y-3">
                {preview && <img src={preview} alt="Tag" className="max-h-24 mx-auto rounded-lg" />}
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                  <p className="font-semibold text-sm">{result.product_name || 'Unknown Product'}</p>
                  {result.brand && <p className="text-xs text-slate-500">{result.brand}</p>}
                  {result.size && <p className="text-xs text-slate-400">{result.size}</p>}
                  {result.store && <p className="text-xs text-slate-400">{result.store}</p>}
                  {result.price && (
                    <p className="text-2xl font-bold text-emerald-600 mt-1">${result.price.toFixed(2)}</p>
                  )}
                  {result.unit_price && <p className="text-xs text-slate-400">{result.unit_price}</p>}
                </div>
                {result.price && (
                  <p className="text-xs text-emerald-600 text-center">{'\u{2705}'} Price recorded to history</p>
                )}
                <div className="flex gap-2">
                  <button onClick={close} className="btn-secondary flex-1 text-sm">Done</button>
                  <button onClick={() => { close(); inputRef.current?.click(); }} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1">
                    <Camera size={14} /> Scan Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

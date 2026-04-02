import React, { useState, useRef, useEffect } from 'react';
import api from '../../api';
import { Scan, X, Camera, Loader2, ShoppingCart, Package } from 'lucide-react';

export default function BarcodeScanner({ onProductFound }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualUpc, setManualUpc] = useState('');
  const [preview, setPreview] = useState(null);
  const [liveSupported, setLiveSupported] = useState(false);
  const photoRef = useRef(null);
  const liveRef = useRef(null);
  const html5QrRef = useRef(null);

  // Check if live scanning is available (HTTPS only)
  useEffect(() => {
    setLiveSupported(window.location.protocol === 'https:' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const lookupBarcode = async (upc) => {
    setLoading(true);
    setPreview(null);
    try {
      const res = await api.get(`/walmart/barcode/${upc}`);
      setProduct({ ...res.data, barcode: upc });
    } catch (e) {
      setProduct({ barcode: upc, product_name: null, message: 'Lookup failed' });
    } finally { setLoading(false); }
  };

  // Photo-based: take photo of barcode, send to AI to read it
  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const img = new window.Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const max = 800;
      let w = img.width, h = img.height;
      if (w > max) { h = (h * max) / w; w = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      setPreview(canvas.toDataURL('image/jpeg', 0.8));
      setLoading(true);

      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          try {
            const res = await api.post('/ai/chat', {
              message: 'Read the barcode number from this image. Return ONLY the numeric barcode/UPC number, nothing else. If you cannot read a barcode, respond with "NONE".',
              imageData: { base64, mediaType: 'image/jpeg' },
            });
            const upc = (res.data.reply || '').replace(/\D/g, '');
            if (upc && upc.length >= 8) {
              lookupBarcode(upc);
            } else {
              setLoading(false);
              setProduct({ barcode: null, product_name: null, message: 'Could not read barcode. Try a clearer photo or enter the number manually.' });
            }
          } catch (err) {
            setLoading(false);
            setProduct({ barcode: null, product_name: null, message: 'Scan failed' });
          }
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  };

  // Live scanning (HTTPS only)
  const startLiveScanning = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('barcode-live-reader');
      html5QrRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        async (decodedText) => {
          await scanner.stop();
          html5QrRef.current = null;
          lookupBarcode(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error('Live scan error:', err);
    }
  };

  const handleManualLookup = (e) => {
    e.preventDefault();
    if (manualUpc.trim()) lookupBarcode(manualUpc.trim());
  };

  const close = () => {
    if (html5QrRef.current) { try { html5QrRef.current.stop(); } catch (e) {} html5QrRef.current = null; }
    setOpen(false); setProduct(null); setManualUpc(''); setPreview(null); setLoading(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm flex items-center gap-1">
        <Scan size={14} /> Scan Barcode
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Scan size={20} /> {loading ? 'Looking up...' : product ? 'Product' : 'Scan Barcode'}
              </h2>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>

            {/* Not loading and no product = scan options */}
            {!loading && !product && (
              <div className="space-y-3">
                {/* Photo scan */}
                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
                <button onClick={() => photoRef.current?.click()}
                  className="w-full btn-primary flex items-center justify-center gap-2">
                  <Camera size={18} /> Take Photo of Barcode
                </button>

                {/* Live scan (HTTPS only) */}
                {liveSupported && (
                  <>
                    <button onClick={startLiveScanning}
                      className="w-full btn-secondary flex items-center justify-center gap-2">
                      <Scan size={18} /> Live Camera Scan
                    </button>
                    <div id="barcode-live-reader" ref={liveRef} className="rounded-xl overflow-hidden" />
                  </>
                )}

                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-600" />
                  <span className="text-xs text-slate-400">or type it</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-600" />
                </div>

                <form onSubmit={handleManualLookup} className="flex gap-2">
                  <input value={manualUpc} onChange={e => setManualUpc(e.target.value)}
                    className="input-field text-sm flex-1" placeholder="Enter UPC number..." />
                  <button type="submit" className="btn-primary px-3 text-sm">Look Up</button>
                </form>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-8">
                {preview && <img src={preview} alt="Barcode" className="max-h-24 mx-auto rounded-lg mb-3 opacity-50" />}
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-family-500" />
                <p className="text-sm text-slate-500">Reading barcode and looking up product...</p>
              </div>
            )}

            {/* Product result */}
            {product && !loading && (
              <div>
                {product.product_name ? (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      {product.image_url && (
                        <img src={product.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-sm">{product.product_name}</p>
                        {product.brand && <p className="text-xs text-slate-500">{product.brand}</p>}
                        {product.quantity && <p className="text-xs text-slate-400">{product.quantity}</p>}
                        {product.nutrition_grade && (
                          <span className={`badge mt-1 ${
                            product.nutrition_grade === 'a' ? 'bg-emerald-100 text-emerald-700' :
                            product.nutrition_grade === 'b' ? 'bg-lime-100 text-lime-700' :
                            product.nutrition_grade === 'c' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>Nutri-Score {product.nutrition_grade.toUpperCase()}</span>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">UPC: {product.barcode}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { if (onProductFound) onProductFound(product, 'grocery'); close(); }}
                        className="btn-primary flex-1 text-sm flex items-center justify-center gap-1">
                        <ShoppingCart size={14} /> Add to Grocery
                      </button>
                      <button onClick={() => { if (onProductFound) onProductFound(product, 'pantry'); close(); }}
                        className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                        <Package size={14} /> Add to Pantry
                      </button>
                    </div>
                    <button onClick={() => { setProduct(null); }} className="btn-secondary w-full text-sm">Scan Another</button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-500 mb-1">{product.message || 'Product not found'}</p>
                    {product.barcode && <p className="text-xs text-slate-400 mb-3">UPC: {product.barcode}</p>}
                    <button onClick={() => setProduct(null)} className="btn-secondary text-sm">Try Again</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../api';
import { Scan, X, Camera, Loader2, Plus, ShoppingCart, Package } from 'lucide-react';

export default function BarcodeScanner({ onProductFound }) {
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualUpc, setManualUpc] = useState('');
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);

  const startScanning = async () => {
    setScanning(true);
    setProduct(null);
    try {
      const scanner = new Html5Qrcode('barcode-reader');
      html5QrRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        async (decodedText) => {
          await scanner.stop();
          html5QrRef.current = null;
          lookupBarcode(decodedText);
        },
        () => {} // ignore errors during scanning
      );
    } catch (err) {
      console.error('Camera error:', err);
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop(); } catch (e) {}
      html5QrRef.current = null;
    }
    setScanning(false);
  };

  const lookupBarcode = async (upc) => {
    setLoading(true);
    setScanning(false);
    try {
      const res = await api.get(`/walmart/barcode/${upc}`);
      setProduct({ ...res.data, barcode: upc });
    } catch (e) {
      setProduct({ barcode: upc, product_name: null, message: 'Lookup failed' });
    } finally { setLoading(false); }
  };

  const handleManualLookup = (e) => {
    e.preventDefault();
    if (manualUpc.trim()) lookupBarcode(manualUpc.trim());
  };

  useEffect(() => {
    return () => { if (html5QrRef.current) { try { html5QrRef.current.stop(); } catch (e) {} } };
  }, []);

  const close = () => { stopScanning(); setProduct(null); setManualUpc(''); };

  return (
    <>
      <button onClick={() => { setScanning(true); setProduct(null); startScanning(); }}
        className="btn-secondary text-sm flex items-center gap-1">
        <Scan size={14} /> Scan Barcode
      </button>

      {(scanning || product || loading) && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Scan size={20} /> {loading ? 'Looking up...' : product ? 'Product Found' : 'Scan Barcode'}
              </h2>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>

            {/* Camera scanner */}
            {scanning && (
              <div>
                <div id="barcode-reader" ref={scannerRef} className="rounded-xl overflow-hidden mb-3" />
                <p className="text-xs text-slate-400 text-center mb-3">Point camera at a barcode</p>
                <form onSubmit={handleManualLookup} className="flex gap-2">
                  <input value={manualUpc} onChange={e => setManualUpc(e.target.value)}
                    className="input-field text-sm flex-1" placeholder="Or type UPC number..." />
                  <button type="submit" className="btn-primary px-3 text-sm">Look Up</button>
                </form>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-8">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-family-500" />
                <p className="text-sm text-slate-500">Looking up product...</p>
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
                          }`}>
                            Nutri-Score {product.nutrition_grade.toUpperCase()}
                          </span>
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

                    <button onClick={() => { setProduct(null); startScanning(); }}
                      className="btn-secondary w-full text-sm">Scan Another</button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-500 mb-1">Product not found for UPC: {product.barcode}</p>
                    <p className="text-xs text-slate-400 mb-3">Not in the Open Food Facts database</p>
                    <button onClick={() => { setProduct(null); startScanning(); }}
                      className="btn-secondary text-sm">Try Again</button>
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

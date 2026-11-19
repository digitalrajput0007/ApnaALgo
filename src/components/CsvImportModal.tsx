import React, { useState } from 'react';
import { X } from 'lucide-react';
import { parseCsvCandles } from '../engine/niftyStrategy';
import { Candle } from '../types/strategy';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (candles: Candle[], name: string) => void;
}

const SAMPLE_CSV = `time,open,high,low,close,volume
09:15,24300,24318,24295,24315,180000
09:20,24315,24319,24301,24304,150000
09:25,24304,24322,24302,24319,145000
09:30,24319,24321,24305,24308,142000
09:35,24308,24325,24306,24322,165000
09:40,24322,24339,24320,24336,178000
09:45,24336,24354,24334,24351,192000
09:50,24351,24368,24349,24364,205000
09:55,24364,24366,24346,24349,154000
10:00,24349,24352,24329,24332,162000
10:05,24332,24336,24318,24321,171000
10:10,24321,24345,24320,24342,199000
10:15,24342,24366,24340,24362,214000
10:20,24362,24394,24360,24391,235000`;

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [label, setLabel] = useState('Custom Fyers 5m Session');
  const [rawCsv, setRawCsv] = useState(SAMPLE_CSV);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = parseCsvCandles(rawCsv);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    onImport(res.candles, label.trim() || 'Custom 5m Session');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2
              id="csv-modal-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Import 5-Minute OHLC Candles
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste Fyers historical CSV rows (time, open, high, low, close, volume)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Session Label
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              CSV Data (5-min bars starting 09:15)
            </span>
            <textarea
              rows={9}
              value={rawCsv}
              onChange={(e) => setRawCsv(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Run Strategy on Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

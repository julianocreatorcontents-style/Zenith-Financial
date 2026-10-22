"use client";
import { useState, useEffect } from "react";
import { Palette, Check } from "lucide-react";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  language?: 'pt-BR' | 'en-US';
}

export default function ColorPicker({ color, onChange, language = 'pt-BR' }: ColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState(color);
  const [hex, setHex] = useState(color.startsWith("#") ? color : "#00ffa3");

  const t = (pt: string, en: string) => (language === 'pt-BR' ? pt : en);

  useEffect(() => {
    setSelectedColor(color);
    if (color.startsWith("#")) {
      setHex(color);
    }
  }, [color]);

  const solidColors = [
    "#00FFA3", "#00D1FF", "#FF00E5", "#FFB800", "#FF4B4B",
    "#ffffff", "#000000", "#800080", "#ffa500", "#00ff00"
  ];

  const gradients = [
    ["#00FFA3", "#00D1FF"],
    ["#FF00E5", "#FFB800"],
    ["#FF4B4B", "#ffa500"],
    ["#0000ff", "#800080"],
  ];

  const handleHexApply = () => {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      onChange(hex);
    }
  };

  return (
    <div className="space-y-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl p-4">
      {/* Preview */}
      <div
        className="h-12 rounded-xl flex items-center justify-center text-black text-[10px] font-bold uppercase tracking-widest shadow-inner"
        style={{ background: selectedColor }}
      >
        {selectedColor.includes('gradient') ? t('Gradiente', 'Gradient') : selectedColor}
      </div>

      {/* Paleta de cores sólidas */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest flex items-center gap-2">
          <Palette size={10} /> {t('Cores Sólidas', 'Solid Colors')}
        </label>
        <div className="flex flex-wrap gap-2">
          {solidColors.map((c, i) => (
            <button
              key={`solid-${c}-${i}`}
              onClick={() => onChange(c)}
              className={`w-6 h-6 rounded-full border transition-all flex items-center justify-center ${selectedColor === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
              style={{ backgroundColor: c }}
            >
              {selectedColor === c && <Check size={10} className={c === '#ffffff' ? 'text-black' : 'text-white'} />}
            </button>
          ))}
        </div>
      </div>

      {/* Gradientes */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest flex items-center gap-2">
          <Palette size={10} /> {t('Gradientes', 'Gradients')}
        </label>
        <div className="flex flex-wrap gap-2">
          {gradients.map((g, i) => {
            const grad = `linear-gradient(to right, ${g[0]}, ${g[1]})`;
            return (
              <button
                key={`grad-${i}`}
                onClick={() => onChange(grad)}
                className={`w-12 h-6 rounded-lg border transition-all flex items-center justify-center ${selectedColor === grad ? 'border-[var(--text-primary)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}
                style={{ background: grad }}
              >
                {selectedColor === grad && <Check size={10} className="text-white" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cor personalizada */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Personalizado (Hex)', 'Custom (Hex)')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={handleHexApply}
            onKeyDown={(e) => e.key === 'Enter' && handleHexApply()}
            className="flex-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg p-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-mono"
            placeholder="#00FFA3"
          />
          <button
            onClick={handleHexApply}
            className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-app)] text-[10px] font-bold rounded-lg uppercase tracking-widest hover:bg-[var(--accent)] transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

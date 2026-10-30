import React from 'react';
import { Download } from 'lucide-react';

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const AssetDiagnosticPanel: React.FC<{ assets: any[] }> = ({ assets }) => {
  
  const handleExport = () => {
    const dataToExport = assets.map(a => ({
      id: a.id,
      name: a.name,
      manualDailyYield: a.manualDailyYield ?? null,
      dailyYieldCalculated: a.dailyYield ?? 0,
      accumulatedYield: a.yieldSinceAnchor ?? 0,
      monthYieldRemaining: a.monthYieldRemaining ?? 0,
      fullObject: a // Salva o objeto inteiro para caso precisemos ver outras propriedades
    }));

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagnostico_ativos_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 p-4 bg-black border-2 border-red-500 rounded-2xl overflow-x-auto text-white shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <h3 className="text-sm font-bold font-mono text-red-400 uppercase tracking-widest">
            Diagnóstico: O que está no Card?
          </h3>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/30 transition-colors"
        >
          <Download size={12} /> Extrair JSON
        </button>
      </div>
      
      <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="pb-2">Ativo</th>
            <th className="pb-2 text-blue-400">Manual (Extrato)</th>
            <th className="pb-2 text-gray-300">Calculado (CDI)</th>
            <th className="pb-2 text-green-400">Exibido no Card</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <tr key={a.id || i} className="border-b border-gray-800">
              <td className="py-2 text-white truncate max-w-[120px]">{a.name}</td>
              <td className="py-2 text-blue-400 font-bold">
                {a.manualDailyYield !== undefined && a.manualDailyYield !== null ? FMT(a.manualDailyYield) : '—'}
              </td>
              <td className="py-2 text-gray-400">
                {FMT(Number(a.dailyYield || 0))}
              </td>
              <td className="py-2 text-green-400 font-bold">
                {FMT(Number(a.dailyYield || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <p className="text-[9px] text-gray-500 mt-2">
        * Se a coluna "Exibido" for diferente da "Manual", a conciliação não está sendo aplicada.
      </p>
    </div>
  );
};

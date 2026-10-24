import { motion } from 'motion/react';
import { Sparkles, Zap, TrendingUp } from 'lucide-react';

export default function ZenithIAView({ language, transactions, assets }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const getMonthTransactions = (month: number, year: number) => transactions.filter((tx: any) => {
    const date = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : null);
    return date && !isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
  });

  const sumByType = (txs: any[], types: string[]) => txs
    .filter((tx: any) => types.includes(tx.type))
    .reduce((acc: number, tx: any) => acc + (tx.value ?? 0), 0);

  const expensesByCategory = (txs: any[]) => txs
    .filter((tx: any) => tx.type === 'out')
    .reduce<Record<string, number>>((acc, tx: any) => {
      const category = tx.categoria_primaria || 'Outros';
      acc[category] = (acc[category] ?? 0) + (tx.value ?? 0);
      return acc;
    }, {});

  const currentMonthTx = getMonthTransactions(currentMonth, currentYear);
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const previousMonthTx = getMonthTransactions(previousMonthDate.getMonth(), previousMonthDate.getFullYear());
  const currentExpenses = expensesByCategory(currentMonthTx);
  const previousExpenses = expensesByCategory(previousMonthTx);
  const topCategory = Object.entries(currentExpenses).sort((a, b) => b[1] - a[1])[0];

  let dailyInsight: string;
  if (topCategory) {
    const [category, value] = topCategory;
    const previousValue = previousExpenses[category] ?? 0;

    if (previousValue > 0) {
      const variation = ((value - previousValue) / previousValue) * 100;
      dailyInsight = t(
        `Sua maior despesa este mês é "${category}" (${formatBRL(value)}), ${variation >= 0 ? 'alta' : 'queda'} de ${Math.abs(variation).toFixed(1)}% em relação ao mês anterior.`,
        `Your largest expense this month is "${category}" (${formatBRL(value)}), ${variation >= 0 ? 'up' : 'down'} ${Math.abs(variation).toFixed(1)}% from last month.`
      );
    } else {
      dailyInsight = t(
        `Sua maior despesa este mês é "${category}", totalizando ${formatBRL(value)}.`,
        `Your largest expense this month is "${category}", totaling ${formatBRL(value)}.`
      );
    }
  } else {
    dailyInsight = t(
      'Ainda não há despesas registradas neste mês. Adicione transações para receber insights.',
      'There are no expenses registered this month yet. Add transactions to receive insights.'
    );
  }

  const recentMonths = [1, 2, 3].map(offset => {
    const date = new Date(currentYear, currentMonth - offset, 1);
    const txs = getMonthTransactions(date.getMonth(), date.getFullYear());
    return {
      hasData: txs.length > 0,
      net: sumByType(txs, ['in', 'yield']) - sumByType(txs, ['out'])
    };
  });
  const monthsWithData = recentMonths.filter(month => month.hasData);
  const averageNet = monthsWithData.length > 0
    ? monthsWithData.reduce((acc, month) => acc + month.net, 0) / monthsWithData.length
    : 0;
  const totalAssets = assets.reduce((acc: number, asset: any) => acc + (asset.value ?? 0), 0);

  const wealthSummary = monthsWithData.length > 0 || totalAssets > 0
    ? t(
      `Seu patrimônio atual é ${formatBRL(totalAssets)}. Nos últimos ${monthsWithData.length} ${monthsWithData.length === 1 ? 'mês' : 'meses'} com movimentação, seu fluxo médio mensal foi ${formatBRL(averageNet)}.`,
      `Your current net worth is ${formatBRL(totalAssets)}. Over the last ${monthsWithData.length} ${monthsWithData.length === 1 ? 'month' : 'months'} with activity, your average monthly cash flow was ${formatBRL(averageNet)}.`
    )
    : t(
      'Cadastre ativos e transações para ver um resumo baseado nos seus dados.',
      'Add assets and transactions to see a summary based on your data.'
    );

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col items-center text-center space-y-4 py-10">
        <div className="w-20 h-20 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] relative">
          <Sparkles size={40} />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
          />
        </div>
        <div>
          <h2 className="text-2xl font-medium text-[var(--text-primary)]">Zenith IA</h2>
          <p className="text-[var(--text-muted)] text-xs max-w-[240px] mx-auto">
            {t("Sua inteligência financeira pessoal está analisando sua carteira.", "Your personal financial intelligence is analyzing your portfolio.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Insight do Dia", "Daily Insight")}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
            "{dailyInsight}"
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Patrimônio e Fluxo", "Net Worth & Cash Flow")}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {wealthSummary}
          </p>
        </div>
      </div>
    </div>
  );
}

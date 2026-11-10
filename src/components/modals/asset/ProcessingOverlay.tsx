import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

export interface ProcessingOverlayProps {
  language: string;
  stage: string;
  progress: number;
}

export function ProcessingOverlay({ language, stage, progress }: ProcessingOverlayProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[var(--bg-card)]/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative w-24 h-24 mb-8">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            filter: [
              'drop-shadow(0 0 5px var(--accent))',
              'drop-shadow(0 0 20px var(--accent))',
              'drop-shadow(0 0 5px var(--accent))',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 flex items-center justify-center text-[var(--accent)]"
        >
          <Sparkles size={48} />
        </motion.div>
        
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute -inset-2 border-2 border-dashed border-[var(--accent)]/30 rounded-full"
        />
      </div>

      <div className="space-y-4 w-full max-w-[240px]">
        <motion.h4 
          key={stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.3em]"
        >
          {stage}
        </motion.h4>
        
        <div className="h-1 w-full bg-[var(--bg-app)] rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
          />
        </div>

        <p className="text-[10px] text-[var(--text-muted)] font-medium">
          {t('Extraindo dados com Agente 03...', 'Extracting data with Agent 03...')}
        </p>
      </div>
    </motion.div>
  );
}

export default ProcessingOverlay;

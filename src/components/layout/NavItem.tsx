import React from 'react';
import { motion } from 'motion/react';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ icon, label, active = false, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all relative ${active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
    >
      {active && (
        <motion.div 
          layoutId="activeNav"
          className="absolute -top-12 w-8 h-1 bg-[var(--accent)] rounded-full shadow-[0_0_10px_var(--accent)]" 
        />
      )}
      {icon}
      <span className="text-[8px] font-bold uppercase tracking-tight">{label}</span>
    </button>
  );
};

export default NavItem;

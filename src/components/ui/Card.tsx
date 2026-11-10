import { forwardRef, type HTMLAttributes, type ElementType } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ as: Component = 'div', className = '', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={`bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 ${className}`.trim()}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';
export default Card;

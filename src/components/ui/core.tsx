import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for Tailwind class merging */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Flat, minimal Button component */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        const variants = {
            primary: 'border border-primary/40 bg-primary text-black hover:bg-primary-strong font-medium',
            secondary: 'border border-white/10 bg-white/[0.06] text-foreground hover:bg-white/[0.1] font-medium',
            outline: 'border border-border bg-transparent hover:bg-white/[0.05] text-foreground',
            ghost: 'bg-transparent hover:bg-white/[0.05] text-muted hover:text-foreground',
            danger: 'bg-red-500/10 border border-red-400/30 text-red-300 hover:bg-red-500 hover:text-white',
        };

        const sizes = {
            sm: 'px-3 py-2 text-xs rounded-md',
            md: 'px-4 py-2.5 text-sm rounded-lg',
            lg: 'px-6 py-3 text-base rounded-lg',
            icon: 'p-2.5 rounded-lg',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

/** Flat Card component — hairline border, no blur */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hover?: boolean;
}

export const Card = ({ className, hover = false, ...props }: CardProps) => {
    return (
        <div
            className={cn(
                'glass rounded-2xl p-5 sm:p-6 transition-colors duration-200',
                hover && 'hover:border-primary/30',
                className
            )}
            {...props}
        />
    );
};

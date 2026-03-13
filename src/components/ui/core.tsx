import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for Tailwind class merging */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Premium Button Component */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        const variants = {
            primary: 'border border-primary/40 bg-[linear-gradient(135deg,#f5e6bf_0%,#d6a95f_48%,#b88943_100%)] text-black hover:brightness-105 font-semibold shadow-[0_18px_40px_rgba(214,169,95,0.22)]',
            secondary: 'border border-white/8 bg-white/8 text-white hover:bg-white/12 font-medium',
            outline: 'border border-border bg-transparent hover:bg-white/6 text-white',
            ghost: 'bg-transparent hover:bg-white/6 text-stone-400 hover:text-white',
            danger: 'bg-red-500/10 border border-red-400/40 text-red-300 hover:bg-red-500 hover:text-white',
        };

        const sizes = {
            sm: 'px-3 py-2 text-xs rounded-xl',
            md: 'px-4 py-2.5 text-sm rounded-2xl',
            lg: 'px-6 py-3.5 text-base rounded-[1.25rem]',
            icon: 'p-2.5 rounded-xl',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
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

/** Glassmorphic Card Component */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hover?: boolean;
}

export const Card = ({ className, hover = false, ...props }: CardProps) => {
    return (
        <div
            className={cn(
                'glass luxury-panel rounded-[1.75rem] p-5 sm:p-6 transition-all duration-300',
                hover && 'hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/[0.06]',
                className
            )}
            {...props}
        />
    );
};

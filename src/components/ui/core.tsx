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
            primary: 'bg-primary text-black hover:bg-orange-500 font-semibold shadow-[0_0_15px_rgba(247,147,26,0.3)]',
            secondary: 'bg-secondary text-white hover:bg-violet-600 font-medium',
            outline: 'border border-border bg-transparent hover:bg-glass text-white',
            ghost: 'bg-transparent hover:bg-glass text-gray-400 hover:text-white',
            danger: 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white',
        };

        const sizes = {
            sm: 'px-3 py-1.5 text-xs rounded-lg',
            md: 'px-4 py-2 text-sm rounded-xl',
            lg: 'px-6 py-3 text-base rounded-2xl',
            icon: 'p-2 rounded-lg',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
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
                'glass rounded-3xl p-6 transition-all duration-300',
                hover && 'hover:bg-glass-border hover:border-white/20 hover:scale-[1.01]',
                className
            )}
            {...props}
        />
    );
};

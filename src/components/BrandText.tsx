import React from 'react';
import { cn } from '../lib/utils';

type BrandTextProps = {
  className?: string;
};

export const BrandText = ({ className }: BrandTextProps) => (
  <span className={cn('font-display font-bold tracking-tight text-[#F8FAFC]', className)}>
    Shravion
    <span className="bg-[linear-gradient(135deg,#8B5CF6,#3B82F6)] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(99,102,241,0.42)]">
      OS
    </span>
  </span>
);

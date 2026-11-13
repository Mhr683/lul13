import React from 'react';
import { Boxes, Briefcase, CalendarClock, Code2, Download, Package, Palette, Repeat } from 'lucide-react';
import { typeInfo, type ProductType } from '../services/productTypes';

// The icon and badge of each kind of product (src/services/productTypes.ts), used on the store
// (browse by kind, product cards, product page) and in Seller Center (choosing what to list).

const ICONS = { Package, Download, Code2, Briefcase, Boxes, CalendarClock, Palette, Repeat };

export const ProductTypeIcon: React.FC<{ type?: ProductType | string; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  const Icon = ICONS[typeInfo(type).icon] || Package;
  return <Icon className={className} />;
};

/** Small coloured label: "Digital product", "Service", ... (nothing for ordinary physical products) */
export const ProductTypeBadge: React.FC<{ type?: ProductType | string; className?: string; showPhysical?: boolean }> = ({
  type,
  className = '',
  showPhysical = false,
}) => {
  const t = typeInfo(type);
  if (t.id === 'PHYSICAL' && !showPhysical) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none whitespace-nowrap ${className}`}
      style={{ color: t.color, backgroundColor: t.bg }}
    >
      <ProductTypeIcon type={t.id} className="w-3 h-3" />
      {t.label}
    </span>
  );
};

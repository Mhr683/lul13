import React from 'react';
import type { PolicySection } from '../data/policies';

// Renders one of the platform policies from src/data/policies.ts
export const PolicyDocument: React.FC<{ intro: string; sections: PolicySection[]; compact?: boolean }> = ({ intro, sections, compact }) => (
  <div className={compact ? 'space-y-3' : 'space-y-5'}>
    <p className="text-sm text-[#444340] leading-relaxed">{intro}</p>
    {sections.map((s) => (
      <section key={s.title} className="space-y-1.5">
        <h3 className={`${compact ? 'text-sm' : 'text-base'} font-bold text-[#141413]`}>{s.title}</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-[#444340] leading-relaxed">
          {s.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

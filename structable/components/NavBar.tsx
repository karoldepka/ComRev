'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',         label: 'Custom TreeTable' },
  { href: '/tanstack', label: 'TanStack Table' },
];

export default function NavBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const currentLabel = TABS.find((t) => t.href === path)?.label ?? 'Menu';

  return (
    <div ref={menuRef} className="hamburger-nav">
      <button
        type="button"
        className="hamburger-btn"
        aria-label="Open navigation menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hamburger-icon">
          <span /><span /><span />
        </span>
        <span className="hamburger-page-name">{currentLabel}</span>
      </button>

      {open && (
        <nav className="hamburger-menu" role="menu">
          {TABS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className={['hamburger-item', path === href ? 'hamburger-item--active' : ''].filter(Boolean).join(' ')}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

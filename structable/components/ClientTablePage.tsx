'use client';

import dynamic from 'next/dynamic';

// Client-only: the table restores per-device view prefs (sort, filters, row numbers, widths)
// from localStorage during its first render, so server-rendered HTML could never match
// (React hydration mismatch). All of its data is client-fetched anyway.
const ClientTablePage = dynamic(() => import('./TablePage'), { ssr: false });

export default ClientTablePage;

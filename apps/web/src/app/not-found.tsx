import React from 'react';
import Link from 'next/link';
import { NyxLogo } from '../components/nyx-logo';

export default function NotFound(): React.JSX.Element {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6 bg-nyx-background text-nyx-text">
      <div className="text-center max-w-md flex flex-col items-center">
        <NyxLogo height={30} className="mb-6" />
        <h1 className="text-4xl font-semibold tracking-tight text-nyx-highlight">404</h1>
        <h2 className="text-lg font-medium text-nyx-text mt-2">Resource Not Found</h2>
        <p className="text-xs text-nyx-muted mt-2">
          The requested ledger entity, route, or resource is unavailable or has been relocated.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center h-9 px-4 mt-6 rounded bg-nyx-primary hover:bg-nyx-primary-hover text-white text-xs font-medium transition"
        >
          Return to Dashboard
        </Link>
      </div>
    </main>
  );
}

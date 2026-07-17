'use client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-surface p-8">
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">
              Application Error
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              {error.message || 'Sonex encountered an unexpected error.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-copper-700 px-4 text-sm font-medium text-white"
            >
              Restart
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

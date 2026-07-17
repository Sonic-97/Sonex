import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">Page not found</h2>
        <p className="mt-1 text-sm text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-copper-700 px-4 text-sm font-medium text-white transition hover:bg-copper-800"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

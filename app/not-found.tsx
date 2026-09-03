import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4 text-center">
      <p className="tnum text-5xl font-semibold text-text-muted">404</p>
      <h1 className="mt-3 text-lg font-semibold text-text-primary">Page introuvable</h1>
      <Link
        href="/dashboard"
        className="mt-5 rounded-[var(--radius-sm)] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}

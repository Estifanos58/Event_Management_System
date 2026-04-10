import Link from "next/link";

type PlaceholderAction = {
  href: string;
  label: string;
};

type RebuildPlaceholderProps = {
  title: string;
  description: string;
  actions?: PlaceholderAction[];
};

export function RebuildPlaceholder({
  title,
  description,
  actions,
}: RebuildPlaceholderProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      {actions && actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

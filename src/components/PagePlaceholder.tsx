type PagePlaceholderProps = {
  title: string;
  description: string;
};

export default function PagePlaceholder({
  title,
  description,
}: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

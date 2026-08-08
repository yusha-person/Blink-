import type { ReactNode } from "react";

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="glass flex flex-col gap-1 p-5">
      <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</h3>
      {description && <p className="mb-2 text-xs text-slate-500">{description}</p>}
      <div className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">{children}</div>
    </section>
  );
}

type SettingsRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
};

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-slate-800 dark:text-slate-200">{label}</span>
        {description && <span className="text-xs text-slate-500">{description}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

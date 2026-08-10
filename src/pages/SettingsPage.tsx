import DataSettings from "../components/DataSettings";
import GoalSettings from "../components/GoalSettings";
import PrivacySettings from "../components/PrivacySettings";
import { SettingsRow, SettingsSection } from "../components/SettingsSection";
import ThemePicker from "../components/ThemePicker";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure LifeXP to fit your workflow.</p>
      </header>

      <SettingsSection title="Appearance" description="Theme and visual preferences.">
        <div className="p-4">
          <ThemePicker />
        </div>
      </SettingsSection>

      <SettingsSection title="Goals" description="Daily point targets that drive your streak.">
        <GoalSettings />
      </SettingsSection>

      <SettingsSection title="Private Notes" description="Master password and encryption for locked notes.">
        <PrivacySettings />
      </SettingsSection>

      <SettingsSection title="Data" description="Backup, export, import, and reset. Everything stays local.">
        <DataSettings />
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsRow label="LifeXP" description="Fully offline habit tracking, notes, and journaling.">
          <span className="text-xs text-slate-500">v0.1.0</span>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export interface CalendarDaySummary {
  date: string;
  points: number;
  xp: number;
  habitsCompleted: number;
  journalWritten: boolean;
  notesCreated: number;
}

export interface CalendarHabit {
  id: number;
  name: string;
  points: number;
  priority: string;
  icon: string;
}

export interface CalendarJournal {
  date: string;
  content: string;
  updatedAt: string;
  written: boolean;
}

export interface CalendarNote {
  id: number;
  title: string;
  isPrivate: boolean;
}

export interface CalendarTask {
  id: number;
  title: string;
  priority: string | null;
  dueTime: string | null;
  completedAt: string | null;
}

export interface CalendarDayDetail {
  date: string;
  points: number;
  xp: number;
  habits: CalendarHabit[];
  journal: CalendarJournal | null;
  notes: CalendarNote[];
  tasks: CalendarTask[];
}

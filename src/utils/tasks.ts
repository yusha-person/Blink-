import type { TaskEntry, TaskSortBy } from "../types/tasks";
import { addDays } from "./timestamps";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function priorityRank(task: TaskEntry): number {
  return task.priority === null ? 3 : PRIORITY_RANK[task.priority];
}

export function sortTasks(tasks: TaskEntry[], sortBy: TaskSortBy): TaskEntry[] {
  const sorted = [...tasks];
  switch (sortBy) {
    case "due":
      sorted.sort((a, b) => {
        if (a.dueDate === null && b.dueDate === null) return priorityRank(a) - priorityRank(b);
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate) || priorityRank(a) - priorityRank(b);
      });
      break;
    case "priority":
      sorted.sort((a, b) => priorityRank(a) - priorityRank(b));
      break;
    case "created":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
      break;
  }
  return sorted;
}

export type TaskGroups = {
  overdue: TaskEntry[];
  today: TaskEntry[];
  upcoming: TaskEntry[];
  later: TaskEntry[];
  noDate: TaskEntry[];
  completed: TaskEntry[];
};

export function groupTasks(tasks: TaskEntry[], today: string): TaskGroups {
  const weekAhead = addDays(today, 7);
  const groups: TaskGroups = {
    overdue: [],
    today: [],
    upcoming: [],
    later: [],
    noDate: [],
    completed: [],
  };
  for (const task of tasks) {
    if (task.completedAt) {
      groups.completed.push(task);
    } else if (!task.dueDate) {
      groups.noDate.push(task);
    } else if (task.dueDate < today) {
      groups.overdue.push(task);
    } else if (task.dueDate === today) {
      groups.today.push(task);
    } else if (task.dueDate <= weekAhead) {
      groups.upcoming.push(task);
    } else {
      groups.later.push(task);
    }
  }
  return groups;
}

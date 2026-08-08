use std::collections::HashMap;

use chrono::{Duration, NaiveDate};

use crate::xp::xp_for_level;

pub const READ_BOOK_HABIT: &str = "Read Book";
pub const POLITICAL_READING_HABIT: &str = "Political Reading";
pub const PRACTICE_PAD_HABIT: &str = "Practice Pad";
pub const METRONOME_HABIT: &str = "Metronome";
pub const CHESS_HABIT: &str = "Chess";

pub struct AchievementDef {
    pub key: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub target: i64,
    pub value: fn(&AchievementStats) -> i64,
}

pub struct AchievementStats {
    pub total_xp: i64,
    pub total_completions: i64,
    pub habit_counts: HashMap<String, i64>,
    pub longest_streak: i64,
}

impl AchievementStats {
    pub fn habit_count(&self, name: &str) -> i64 {
        self.habit_counts.get(name).copied().unwrap_or(0)
    }
}

fn any_completion(s: &AchievementStats) -> i64 {
    s.total_completions
}

fn total_xp(s: &AchievementStats) -> i64 {
    s.total_xp
}

fn read_book_count(s: &AchievementStats) -> i64 {
    s.habit_count(READ_BOOK_HABIT)
}

fn political_reading_count(s: &AchievementStats) -> i64 {
    s.habit_count(POLITICAL_READING_HABIT)
}

fn music_sessions(s: &AchievementStats) -> i64 {
    s.habit_count(PRACTICE_PAD_HABIT) + s.habit_count(METRONOME_HABIT)
}

fn chess_count(s: &AchievementStats) -> i64 {
    s.habit_count(CHESS_HABIT)
}

fn longest_streak(s: &AchievementStats) -> i64 {
    s.longest_streak
}

pub const ACHIEVEMENTS: &[AchievementDef] = &[
    AchievementDef {
        key: "first-habit",
        name: "First Habit",
        description: "Complete a habit for the first time.",
        target: 1,
        value: any_completion,
    },
    AchievementDef {
        key: "first-100-xp",
        name: "First 100 XP",
        description: "Earn your first 100 total XP.",
        target: 100,
        value: total_xp,
    },
    AchievementDef {
        key: "read-100-pages",
        name: "Read 100 Pages",
        description: "Complete the Read Book habit 100 times.",
        target: 100,
        value: read_book_count,
    },
    AchievementDef {
        key: "read-1000-pages",
        name: "Read 1000 Pages",
        description: "Complete the Read Book habit 1000 times.",
        target: 1000,
        value: read_book_count,
    },
    AchievementDef {
        key: "first-political-reading",
        name: "First Political Reading",
        description: "Complete the Political Reading habit for the first time.",
        target: 1,
        value: political_reading_count,
    },
    AchievementDef {
        key: "musician",
        name: "Musician",
        description: "Complete 20 combined Practice Pad and Metronome sessions.",
        target: 20,
        value: music_sessions,
    },
    AchievementDef {
        key: "chess-player",
        name: "Chess Player",
        description: "Complete the Chess habit 20 times.",
        target: 20,
        value: chess_count,
    },
    AchievementDef {
        key: "streak-7",
        name: "7-Day Streak",
        description: "Reach a streak of 7 goal-met days.",
        target: 7,
        value: longest_streak,
    },
    AchievementDef {
        key: "streak-30",
        name: "30-Day Streak",
        description: "Reach a streak of 30 goal-met days.",
        target: 30,
        value: longest_streak,
    },
    AchievementDef {
        key: "level-5",
        name: "Reach Level 5",
        description: "Earn enough XP to reach level 5.",
        target: xp_for_level(5),
        value: total_xp,
    },
    AchievementDef {
        key: "level-10",
        name: "Reach Level 10",
        description: "Earn enough XP to reach level 10.",
        target: xp_for_level(10),
        value: total_xp,
    },
    AchievementDef {
        key: "xp-5000",
        name: "Earn 5000 XP",
        description: "Earn 5000 total XP.",
        target: 5000,
        value: total_xp,
    },
];

pub fn longest_streak_from_met_dates(met_dates_asc: &[NaiveDate]) -> i64 {
    let mut longest: i64 = 0;
    let mut run: i64 = 0;
    let mut prev: Option<NaiveDate> = None;
    for d in met_dates_asc {
        run = match prev {
            Some(p) if *d - p == Duration::days(1) => run + 1,
            _ => 1,
        };
        if run > longest {
            longest = run;
        }
        prev = Some(*d);
    }
    longest
}

#[cfg(test)]
mod tests {
    use super::*;

    fn days(start: &str, count: i64) -> Vec<NaiveDate> {
        let first = NaiveDate::parse_from_str(start, "%Y-%m-%d").unwrap();
        (0..count).map(|i| first + Duration::days(i)).collect()
    }

    #[test]
    fn longest_streak_walks_consecutive_runs() {
        let mut dates = days("2026-01-01", 3);
        dates.extend(days("2026-02-10", 5));
        assert_eq!(longest_streak_from_met_dates(&dates), 5);
    }

    #[test]
    fn longest_streak_empty_and_single() {
        assert_eq!(longest_streak_from_met_dates(&[]), 0);
        assert_eq!(longest_streak_from_met_dates(&days("2026-01-01", 1)), 1);
    }

    #[test]
    fn level_targets_match_formula() {
        let level5 = ACHIEVEMENTS.iter().find(|a| a.key == "level-5").unwrap();
        let level10 = ACHIEVEMENTS.iter().find(|a| a.key == "level-10").unwrap();
        assert_eq!(level5.target, 700);
        assert_eq!(level10.target, 2700);
    }

    #[test]
    fn all_keys_unique() {
        let mut keys: Vec<&str> = ACHIEVEMENTS.iter().map(|a| a.key).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), ACHIEVEMENTS.len());
    }
}

use chrono::NaiveDate;
use serde::Serialize;

pub const MIN_GOAL_POINTS: i64 = 8;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakInfo {
    pub current: i64,
    pub longest: i64,
    pub last_met_date: Option<String>,
    pub today_met: bool,
}

/// Computes the current streak from a descending-sorted, duplicate-free list of
/// dates (YYYY-MM-DD) on which the daily minimum goal was met.
///
/// A day counts toward the streak once its points reach the minimum goal before
/// the day boundary. The streak stays alive through "today" until midnight:
/// if today is not met yet, the streak is anchored on yesterday. If neither
/// today nor yesterday is met, any gap means the streak is broken (0).
///
/// Returns (current streak, most recent met date <= today).
pub fn current_streak(met_dates_desc: &[NaiveDate], today: NaiveDate) -> (i64, Option<NaiveDate>) {
    let last_met = met_dates_desc
        .iter()
        .copied()
        .filter(|d| *d <= today)
        .max();
    let today_met = met_dates_desc.contains(&today);

    let anchor = if today_met {
        today
    } else {
        match today.pred_opt() {
            Some(yesterday) => yesterday,
            None => return (0, last_met),
        }
    };

    let mut streak = 0i64;
    let mut expected = anchor;
    for date in met_dates_desc.iter().copied().filter(|d| *d <= anchor) {
        if date == expected {
            streak += 1;
            expected = expected.pred_opt().unwrap_or(expected);
        } else if date < expected {
            break;
        }
    }
    (streak, last_met)
}

pub fn streak_info(met_dates_desc: &[NaiveDate], stored_longest: i64, today: NaiveDate) -> StreakInfo {
    let (current, last_met) = current_streak(met_dates_desc, today);
    StreakInfo {
        current,
        longest: stored_longest.max(current),
        last_met_date: last_met.map(|d| d.format("%Y-%m-%d").to_string()),
        today_met: met_dates_desc.contains(&today),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn dates(list: &[&str]) -> Vec<NaiveDate> {
        list.iter().map(|s| d(s)).collect()
    }

    #[test]
    fn no_met_days_is_zero() {
        let (current, last_met) = current_streak(&[], d("2026-08-08"));
        assert_eq!(current, 0);
        assert_eq!(last_met, None);
    }

    #[test]
    fn today_met_starts_streak() {
        let (current, last_met) = current_streak(&dates(&["2026-08-08"]), d("2026-08-08"));
        assert_eq!(current, 1);
        assert_eq!(last_met, Some(d("2026-08-08")));
    }

    #[test]
    fn consecutive_days_including_today() {
        let mets = dates(&["2026-08-08", "2026-08-07", "2026-08-06", "2026-08-04"]);
        let (current, _) = current_streak(&mets, d("2026-08-08"));
        assert_eq!(current, 3);
    }

    #[test]
    fn streak_survives_unfinished_today() {
        let mets = dates(&["2026-08-07", "2026-08-06", "2026-08-05"]);
        let (current, last_met) = current_streak(&mets, d("2026-08-08"));
        assert_eq!(current, 3);
        assert_eq!(last_met, Some(d("2026-08-07")));
    }

    #[test]
    fn missed_yesterday_breaks_streak() {
        let mets = dates(&["2026-08-06", "2026-08-05", "2026-08-04"]);
        let (current, last_met) = current_streak(&mets, d("2026-08-08"));
        assert_eq!(current, 0);
        assert_eq!(last_met, Some(d("2026-08-06")));
    }

    #[test]
    fn today_met_but_yesterday_missed_is_one() {
        let mets = dates(&["2026-08-08", "2026-08-06", "2026-08-05"]);
        let (current, _) = current_streak(&mets, d("2026-08-08"));
        assert_eq!(current, 1);
    }

    #[test]
    fn month_boundary_counts_as_consecutive() {
        let mets = dates(&["2026-09-01", "2026-08-31", "2026-08-30"]);
        let (current, _) = current_streak(&mets, d("2026-09-01"));
        assert_eq!(current, 3);
    }

    #[test]
    fn longest_only_grows() {
        let info = streak_info(&dates(&["2026-08-08"]), 10, d("2026-08-08"));
        assert_eq!(info.current, 1);
        assert_eq!(info.longest, 10);
        let info = streak_info(&dates(&["2026-08-08", "2026-08-07"]), 1, d("2026-08-08"));
        assert_eq!(info.longest, 2);
    }
}

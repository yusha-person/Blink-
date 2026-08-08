use serde::Serialize;

pub const MIN_LEVEL: i64 = 1;

pub const fn xp_for_level(level: i64) -> i64 {
    25 * (level - 1) * (level + 2)
}

pub fn level_for_xp(total_xp: i64) -> i64 {
    let xp = total_xp.max(0);
    let mut level = MIN_LEVEL;
    while xp_for_level(level + 1) <= xp {
        level += 1;
    }
    level
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelProgress {
    pub level: i64,
    pub total_xp: i64,
    pub current_level_xp: i64,
    pub next_level_xp: i64,
    pub xp_into_level: i64,
    pub xp_to_next_level: i64,
    pub progress_ratio: f64,
}

pub fn level_progress(total_xp: i64) -> LevelProgress {
    let total_xp = total_xp.max(0);
    let level = level_for_xp(total_xp);
    let current_level_xp = xp_for_level(level);
    let next_level_xp = xp_for_level(level + 1);
    let xp_into_level = total_xp - current_level_xp;
    let level_span = next_level_xp - current_level_xp;
    let xp_to_next_level = level_span - xp_into_level;
    let progress_ratio = if level_span > 0 {
        xp_into_level as f64 / level_span as f64
    } else {
        0.0
    };
    LevelProgress {
        level,
        total_xp,
        current_level_xp,
        next_level_xp,
        xp_into_level,
        xp_to_next_level,
        progress_ratio,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xp_thresholds_match_formula() {
        assert_eq!(xp_for_level(1), 0);
        assert_eq!(xp_for_level(2), 100);
        assert_eq!(xp_for_level(3), 250);
        assert_eq!(xp_for_level(4), 450);
        assert_eq!(xp_for_level(5), 700);
        assert_eq!(xp_for_level(10), 2700);
    }

    #[test]
    fn level_is_1_with_no_xp() {
        assert_eq!(level_for_xp(0), 1);
        assert_eq!(level_for_xp(99), 1);
    }

    #[test]
    fn level_advances_exactly_at_threshold() {
        assert_eq!(level_for_xp(100), 2);
        assert_eq!(level_for_xp(249), 2);
        assert_eq!(level_for_xp(250), 3);
        assert_eq!(level_for_xp(2699), 9);
        assert_eq!(level_for_xp(2700), 10);
    }

    #[test]
    fn negative_xp_is_clamped_to_level_1() {
        assert_eq!(level_for_xp(-50), 1);
        let p = level_progress(-50);
        assert_eq!(p.total_xp, 0);
        assert_eq!(p.level, 1);
    }

    #[test]
    fn progress_at_level_start_is_zero() {
        let p = level_progress(100);
        assert_eq!(p.level, 2);
        assert_eq!(p.current_level_xp, 100);
        assert_eq!(p.next_level_xp, 250);
        assert_eq!(p.xp_into_level, 0);
        assert_eq!(p.xp_to_next_level, 150);
        assert_eq!(p.progress_ratio, 0.0);
    }

    #[test]
    fn progress_mid_level() {
        let p = level_progress(175);
        assert_eq!(p.level, 2);
        assert_eq!(p.xp_into_level, 75);
        assert_eq!(p.xp_to_next_level, 75);
        assert!((p.progress_ratio - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn progress_just_below_next_level() {
        let p = level_progress(249);
        assert_eq!(p.level, 2);
        assert_eq!(p.xp_to_next_level, 1);
        assert!(p.progress_ratio < 1.0);
    }

    #[test]
    fn large_xp_values() {
        let p = level_progress(1_000_000);
        assert!(p.level > 1);
        assert!(p.current_level_xp <= p.total_xp);
        assert!(p.total_xp < p.next_level_xp);
        assert_eq!(p.xp_into_level + p.xp_to_next_level, p.next_level_xp - p.current_level_xp);
    }
}

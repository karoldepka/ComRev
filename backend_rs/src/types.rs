use chrono::{DateTime, Utc};
use serde_json::Value as JsonValue;
use std::collections::{HashMap, HashSet};

#[derive(serde::Serialize)]
pub struct PagedResponse {
    pub data: Vec<JsonValue>,
    pub total: i64,
    pub page: u32,
    pub per_page: u32,
}

/// Generic query parameters for listing rows of any table.
///
/// Filter encoding (all driven by custom_columns.source_path and .types):
///   `{dot-path}_min=N`      — numeric lower bound
///   `{dot-path}_max=N`      — numeric upper bound
///   `{dot-path}_after=ISO`  — datetime lower bound
///   `{dot-path}_before=ISO` — datetime upper bound
///   `{dot-path}_like=pat`   — ILIKE pattern (comma-sep OR; % added automatically)
///   `{dot-path}=v1,v2`      — exact / categorical OR (array ?| for array-typed columns)
///   `q=text`                — full-text search across indexed text columns
#[derive(Debug, Default, Clone)]
pub struct RowQuery {
    pub sort: Option<String>,
    pub page: u32,
    pub per_page: u32,
    pub q: Option<String>,

    /// Numeric range filters built from `*_min` / `*_max` URL params.
    /// Each entry: (dot-path, min, max)
    pub range_filters: Vec<(String, Option<f64>, Option<f64>)>,

    /// Date/time range filters built from `*_after` / `*_before` URL params.
    /// Each entry: (dot-path, after, before)
    pub date_filters: Vec<(String, Option<DateTime<Utc>>, Option<DateTime<Utc>>)>,

    /// Exact / categorical / boolean / array-containment filters.
    /// Values are pre-split on comma.  The backend picks the SQL operator
    /// based on custom_columns.types for the column.
    /// Each entry: (dot-path, [value, ...])
    pub value_filters: Vec<(String, Vec<String>)>,

    /// ILIKE filters built from `*_like` URL params.
    /// Patterns are pre-split on comma; '%' wrapping is added in SQL.
    /// Each entry: (dot-path, [pattern, ...])
    pub like_filters: Vec<(String, Vec<String>)>,

    /// Per-request fan-read timeout override for MultiStore reads (seconds).
    /// Passed as `?read_timeout_secs=N` in the query string.
    /// Falls back to the `FAN_READ_TIMEOUT_SECS` env var, then 60 s.
    pub read_timeout_secs: Option<u64>,
}

impl RowQuery {
    pub fn from_map(map: &HashMap<String, String>) -> Self {
        const KNOWN: &[&str] = &["sort", "page", "per_page", "q"];

        let mut min_map: HashMap<String, f64> = HashMap::new();
        let mut max_map: HashMap<String, f64> = HashMap::new();
        let mut after_map: HashMap<String, DateTime<Utc>> = HashMap::new();
        let mut before_map: HashMap<String, DateTime<Utc>> = HashMap::new();
        let mut value_map: HashMap<String, Vec<String>> = HashMap::new();
        let mut like_map: HashMap<String, Vec<String>> = HashMap::new();

        for (key, val) in map {
            if KNOWN.contains(&key.as_str()) {
                continue;
            }

            if let Some(path) = key.strip_suffix("_min") {
                if let Ok(n) = val.parse::<f64>() {
                    min_map.insert(path.to_owned(), n);
                }
            } else if let Some(path) = key.strip_suffix("_max") {
                if let Ok(n) = val.parse::<f64>() {
                    max_map.insert(path.to_owned(), n);
                }
            } else if let Some(path) = key.strip_suffix("_after") {
                if let Ok(dt) = val.parse::<DateTime<Utc>>() {
                    after_map.insert(path.to_owned(), dt);
                }
            } else if let Some(path) = key.strip_suffix("_before") {
                if let Ok(dt) = val.parse::<DateTime<Utc>>() {
                    before_map.insert(path.to_owned(), dt);
                }
            } else if let Some(path) = key.strip_suffix("_like") {
                let patterns: Vec<String> = val
                    .split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !patterns.is_empty() {
                    like_map.insert(path.to_owned(), patterns);
                }
            } else {
                let vals: Vec<String> = val
                    .split(',')
                    .map(|s| s.trim().to_owned())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !vals.is_empty() {
                    value_map.insert(key.to_owned(), vals);
                }
            }
        }

        fn merge_pair<V: Clone>(
            keys: &mut HashSet<String>,
            a: &HashMap<String, V>,
            b: &HashMap<String, V>,
        ) {
            a.keys().chain(b.keys()).for_each(|k| {
                keys.insert(k.clone());
            });
        }

        let mut range_keys: HashSet<String> = HashSet::new();
        merge_pair(&mut range_keys, &min_map, &max_map);
        let range_filters = range_keys
            .into_iter()
            .map(|p| {
                (
                    p.clone(),
                    min_map.get(&p).copied(),
                    max_map.get(&p).copied(),
                )
            })
            .collect();

        let mut date_keys: HashSet<String> = HashSet::new();
        merge_pair(&mut date_keys, &after_map, &before_map);
        let date_filters = date_keys
            .into_iter()
            .map(|p| {
                (
                    p.clone(),
                    after_map.get(&p).copied(),
                    before_map.get(&p).copied(),
                )
            })
            .collect();

        RowQuery {
            sort: map.get("sort").cloned(),
            page: map.get("page").and_then(|v| v.parse().ok()).unwrap_or(1),
            per_page: map
                .get("per_page")
                .and_then(|v| v.parse().ok())
                .unwrap_or(50),
            q: map.get("q").cloned(),
            range_filters,
            date_filters,
            value_filters: value_map.into_iter().collect(),
            like_filters: like_map.into_iter().collect(),
            read_timeout_secs: map.get("read_timeout_secs").and_then(|v| v.parse().ok()),
        }
    }
}

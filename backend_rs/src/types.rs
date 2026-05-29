use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

#[derive(Serialize)]
pub struct PagedResponse {
    pub data:     Vec<JsonValue>,
    pub total:    i64,
    pub page:     u32,
    pub per_page: u32,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct RowQuery {
    pub sort: Option<String>,

    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_per_page")]
    pub per_page: u32,

    pub stars_min:           Option<i64>,
    pub stars_max:           Option<i64>,
    pub forks_min:           Option<i64>,
    pub forks_max:           Option<i64>,
    pub open_issues_min:     Option<i64>,
    pub open_issues_max:     Option<i64>,
    pub size_min:            Option<i64>,
    pub size_max:            Option<i64>,
    pub stars_now_min:       Option<i64>,
    pub stars_now_max:       Option<i64>,

    pub stars_diff_6h_min:   Option<i64>,
    pub stars_diff_6h_max:   Option<i64>,
    pub stars_diff_12h_min:  Option<i64>,
    pub stars_diff_12h_max:  Option<i64>,
    pub stars_diff_24h_min:  Option<i64>,
    pub stars_diff_24h_max:  Option<i64>,
    pub stars_diff_48h_min:  Option<i64>,
    pub stars_diff_48h_max:  Option<i64>,
    pub stars_diff_5d_min:   Option<i64>,
    pub stars_diff_5d_max:   Option<i64>,
    pub stars_diff_7d_min:   Option<i64>,
    pub stars_diff_7d_max:   Option<i64>,
    pub stars_diff_10d_min:  Option<i64>,
    pub stars_diff_10d_max:  Option<i64>,
    pub stars_diff_14d_min:  Option<i64>,
    pub stars_diff_14d_max:  Option<i64>,
    pub stars_diff_20d_min:  Option<i64>,
    pub stars_diff_20d_max:  Option<i64>,
    pub stars_diff_30d_min:  Option<i64>,
    pub stars_diff_30d_max:  Option<i64>,

    pub language:    Option<String>,
    pub license:     Option<String>,
    pub visibility:  Option<String>,
    pub owner_login: Option<String>,

    pub archived: Option<bool>,
    pub disabled: Option<bool>,

    pub topics:      Option<String>,
    pub topics_like: Option<String>,

    pub pushed_after:   Option<DateTime<Utc>>,
    pub pushed_before:  Option<DateTime<Utc>>,
    pub created_after:  Option<DateTime<Utc>>,
    pub created_before: Option<DateTime<Utc>>,

    pub q: Option<String>,
}

fn default_page()     -> u32 { 1 }
fn default_per_page() -> u32 { 50 }

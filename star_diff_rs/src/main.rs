use anyhow::{Context, Result};
use bson;
use chrono::{TimeZone, Utc};
use git2::{Oid, Repository};
use log::{debug, info, trace, warn};
use env_logger;
use regex::Regex;
use serde_json;
use serde_yaml::{Mapping, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const MISSING_AS_ZERO: bool = true;

struct WindowDef {
    label: &'static str,
    duration: Duration,
}

impl WindowDef {
    fn from_label(label: &'static str) -> Self {
        static RE: OnceLock<Regex> = OnceLock::new();
        let re = RE.get_or_init(|| Regex::new(r"^(\d+)(h|d)$").unwrap());
        let caps = re.captures(label)
            .unwrap_or_else(|| panic!("invalid window label: {label}"));
        let n: u64 = caps[1].parse().unwrap();
        let secs = match &caps[2] {
            "h" => n * 3600,
            "d" => n * 86400,
            _   => unreachable!(),
        };
        Self { label, duration: Duration::from_secs(secs) }
    }
}

fn sort_keys() -> &'static [&'static str] {
    static SORT_KEYS: OnceLock<Vec<&'static str>> = OnceLock::new();
    SORT_KEYS.get_or_init(|| windows().iter().map(|w| w.label).collect())
}

fn windows() -> &'static [WindowDef] {
    static WINDOWS: OnceLock<Vec<WindowDef>> = OnceLock::new();
    WINDOWS.get_or_init(|| vec![
        WindowDef::from_label("6h"),
        WindowDef::from_label("12h"),
        WindowDef::from_label("24h"),
        WindowDef::from_label("48h"),
        WindowDef::from_label("5d"),
        WindowDef::from_label("7d"),
        WindowDef::from_label("10d"),
        WindowDef::from_label("14d"),
        WindowDef::from_label("20d"),
        WindowDef::from_label("30d"),
    ])
}


fn data_repo_dir() -> Result<PathBuf> {
    let cwd = std::env::current_dir()?;
    // assume repo root contains this folder; mirror Python: ../ComRev_Data
    let base = cwd;
    let data = base.join("..").join("..").join("ComRev_Data");
    let resolved = data.canonicalize().unwrap_or(data);
    debug!("data_repo_dir -> {}", resolved.display());
    Ok(resolved)
}

fn load_yaml_from_file(path: &Path) -> Result<Vec<Value>> {
    debug!("Reading YAML file: {}", path.display());
    let s = fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    debug!("Read {} bytes from {}", s.len(), path.display());
    let v: Vec<Value> = serde_yaml::from_str(&s)
        .with_context(|| format!("parsing YAML from {}", path.display()))?;
    Ok(v)
}

fn parse_yaml_to_index(v: &[Value]) -> HashMap<i64, Value> {
    let mut map = HashMap::new();
    for item in v {
        if let Value::Mapping(m) = item {
            if let Some(id_val) = m.get(&Value::from("id")) {
                if let Some(id) = id_val.as_i64() {
                    map.insert(id, item.clone());
                }
            }
        }
    }
    map
}

fn get_i64_field(v: &Value, key: &str) -> Option<i64> {
    if let Value::Mapping(m) = v {
        m.get(&Value::from(key)).and_then(|x| x.as_i64())
    } else {
        None
    }
}

fn get_nested_i64(v: &Value, keys: &[&str]) -> Option<i64> {
    let mut cur = v;
    for (i, k) in keys.iter().enumerate() {
        if let Value::Mapping(m) = cur {
            match m.get(&Value::from(*k)) {
                Some(next) => cur = next,
                None => return None,
            }
        } else {
            return None;
        }
        if i == keys.len() - 1 {
            return cur.as_i64();
        }
    }
    None
}

fn load_yaml_from_commit(repo: &Repository, commit_oid: Oid, rel_path: &Path) -> Result<Vec<Value>> {
    let commit = repo.find_commit(commit_oid)?;
    let tree = commit.tree()?;
    let entry = match tree.get_path(rel_path) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };
    let blob = repo.find_blob(entry.id())?;
    let content = std::str::from_utf8(blob.content())?;
    trace!("Loaded blob {} ({} bytes) from commit {} for {}", entry.id(), content.len(), commit_oid, rel_path.display());
    let v: Vec<Value> = serde_yaml::from_str(content)
        .with_context(|| format!("parsing YAML from commit {} at {}", commit_oid, rel_path.display()))?;
    Ok(v)
}

fn find_commit_before(repo: &Repository, branch: &str, target_ts: i64) -> Result<Option<(Oid, i64)>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.push_ref(format!("refs/heads/{}", branch).as_str()).ok();
    for oid_res in revwalk {
        let oid = oid_res?;
        let commit = repo.find_commit(oid)?;
        let commit_time = commit.time().seconds();
        if commit_time <= target_ts {
            trace!("find_commit_before: chosen commit {} at {}", oid, Utc.timestamp_opt(commit_time, 0).single().unwrap_or_default());
            return Ok(Some((oid, commit_time)));
        }
    }
    Ok(None)
}

fn compute_star_diff(stars_now: i64, old_repo: Option<&Value>) -> i64 {
    match old_repo {
        None => {
            if MISSING_AS_ZERO { 0 } else { stars_now }
        }
        Some(v) => match get_i64_field(v, "stars") {
            Some(old) => stars_now - old,
            None => stars_now,
        },
    }
}

fn build_repo_diffs(repo_id: i64, stars_now: i64, snapshots: &HashMap<String, HashMap<i64, Value>>) -> Mapping {
    let mut m = Mapping::new();
    for w in windows().iter() {
        let old_repo: Option<&Value> = snapshots.get(w.label).and_then(|s| s.get(&repo_id));
        let diff = compute_star_diff(stars_now, old_repo);
        m.insert(Value::from(w.label), Value::from(diff));
    }
    m
}

fn fmt_bytes(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 { out.push(' '); }
        out.push(c);
    }
    out
}

fn has_any_change(diffs: &Mapping) -> bool {
    for (_k, v) in diffs.iter() {
        if let Some(n) = v.as_i64() {
            if n != 0 {
                return true;
            }
        }
    }
    false
}

fn build_output_repo(mut repo_data: Value, stars_now: i64, diffs: Mapping) -> Value {
    if let Value::Mapping(ref mut m) = repo_data {
        m.insert(Value::from("stars_now"), Value::from(stars_now));
        m.insert(Value::from("stars_diff"), Value::Mapping(diffs));
    }
    repo_data
}

fn yaml_to_csv_str(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(v).unwrap_or_default(),
    }
}

fn result_to_csv(result: &[Value]) -> Result<Vec<u8>> {
    let mut wtr = csv::Writer::from_writer(vec![]);
    let window_labels: Vec<&str> = windows().iter().map(|w| w.label).collect();

    // Collect metadata keys in first-seen order, excluding stars_diff
    let mut meta_keys: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for repo in result {
        if let Value::Mapping(m) = repo {
            for (k, _) in m.iter() {
                if let Some(s) = k.as_str() {
                    if s != "stars_diff" && seen.insert(s.to_string()) {
                        meta_keys.push(s.to_string());
                    }
                }
            }
        }
    }

    let mut headers: Vec<String> = meta_keys.clone();
    for label in &window_labels {
        headers.push(format!("stars_{}", label));
    }
    wtr.write_record(&headers)?;

    for repo in result {
        let mut row: Vec<String> = meta_keys.iter()
            .map(|k| repo.get(k.as_str()).map(yaml_to_csv_str).unwrap_or_default())
            .collect();
        for label in &window_labels {
            row.push(get_nested_i64(repo, &["stars_diff", label]).unwrap_or(0).to_string());
        }
        wtr.write_record(&row)?;
    }
    Ok(wtr.into_inner().map_err(|e| anyhow::anyhow!("csv flush: {e}"))?)
}

fn sort_repos(repos: &mut Vec<Value>) {
    repos.sort_by(|a, b| {
        sort_keys().iter().fold(std::cmp::Ordering::Equal, |ord, key| {
            ord.then_with(|| {
                let get = |v: &Value| get_nested_i64(v, &["stars_diff", key]).unwrap_or(0);
                get(b).cmp(&get(a))
            })
        })
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── fmt_bytes ────────────────────────────────────────────────────────────

    #[test]
    fn fmt_bytes_zero_and_sub_thousand() {
        assert_eq!(fmt_bytes(0), "0");
        assert_eq!(fmt_bytes(999), "999");
    }

    #[test]
    fn fmt_bytes_thousands() {
        assert_eq!(fmt_bytes(1_000), "1 000");
        assert_eq!(fmt_bytes(1_234_567), "1 234 567");
        assert_eq!(fmt_bytes(1_000_000_000), "1 000 000 000");
    }

    // ── get_i64_field ────────────────────────────────────────────────────────

    #[test]
    fn get_i64_field_present() {
        let v: Value = serde_yaml::from_str("stars: 42").unwrap();
        assert_eq!(get_i64_field(&v, "stars"), Some(42));
    }

    #[test]
    fn get_i64_field_missing_key() {
        let v: Value = serde_yaml::from_str("name: foo").unwrap();
        assert_eq!(get_i64_field(&v, "stars"), None);
    }

    #[test]
    fn get_i64_field_not_a_mapping() {
        assert_eq!(get_i64_field(&Value::from("string"), "stars"), None);
    }

    // ── get_nested_i64 ───────────────────────────────────────────────────────

    #[test]
    fn get_nested_i64_present() {
        let v: Value = serde_yaml::from_str("stars_diff:\n  7d: 99").unwrap();
        assert_eq!(get_nested_i64(&v, &["stars_diff", "7d"]), Some(99));
    }

    #[test]
    fn get_nested_i64_missing_middle_key() {
        let v: Value = serde_yaml::from_str("foo: bar").unwrap();
        assert_eq!(get_nested_i64(&v, &["stars_diff", "7d"]), None);
    }

    #[test]
    fn get_nested_i64_middle_not_a_mapping() {
        // stars_diff is a scalar, not a mapping
        let v: Value = serde_yaml::from_str("stars_diff: 5").unwrap();
        assert_eq!(get_nested_i64(&v, &["stars_diff", "7d"]), None);
    }

    // ── compute_star_diff ────────────────────────────────────────────────────

    #[test]
    fn compute_star_diff_no_old_repo_missing_as_zero() {
        // MISSING_AS_ZERO = true → returns 0 regardless of stars_now
        assert_eq!(compute_star_diff(500, None), 0);
        assert_eq!(compute_star_diff(0, None), 0);
    }

    #[test]
    fn compute_star_diff_with_old_stars() {
        let old: Value = serde_yaml::from_str("stars: 400").unwrap();
        assert_eq!(compute_star_diff(500, Some(&old)), 100);
        assert_eq!(compute_star_diff(400, Some(&old)), 0);
        assert_eq!(compute_star_diff(300, Some(&old)), -100);
    }

    #[test]
    fn compute_star_diff_old_repo_lacks_stars_field() {
        let old: Value = serde_yaml::from_str("name: foo").unwrap();
        assert_eq!(compute_star_diff(500, Some(&old)), 500);
    }

    // ── has_any_change ───────────────────────────────────────────────────────

    #[test]
    fn has_any_change_all_zeros() {
        let mut m = Mapping::new();
        m.insert(Value::from("6h"), Value::from(0i64));
        m.insert(Value::from("30d"), Value::from(0i64));
        assert!(!has_any_change(&m));
    }

    #[test]
    fn has_any_change_one_positive() {
        let mut m = Mapping::new();
        m.insert(Value::from("6h"), Value::from(0i64));
        m.insert(Value::from("30d"), Value::from(5i64));
        assert!(has_any_change(&m));
    }

    #[test]
    fn has_any_change_negative_counts() {
        let mut m = Mapping::new();
        m.insert(Value::from("6h"), Value::from(-3i64));
        assert!(has_any_change(&m));
    }

    #[test]
    fn has_any_change_empty_mapping() {
        let m = Mapping::new();
        assert!(!has_any_change(&m));
    }

    // ── yaml_to_csv_str ──────────────────────────────────────────────────────

    #[test]
    fn yaml_to_csv_str_null() {
        assert_eq!(yaml_to_csv_str(&Value::Null), "");
    }

    #[test]
    fn yaml_to_csv_str_booleans() {
        assert_eq!(yaml_to_csv_str(&Value::Bool(true)), "true");
        assert_eq!(yaml_to_csv_str(&Value::Bool(false)), "false");
    }

    #[test]
    fn yaml_to_csv_str_numbers() {
        assert_eq!(yaml_to_csv_str(&Value::from(42i64)), "42");
        assert_eq!(yaml_to_csv_str(&Value::from(-7i64)), "-7");
    }

    #[test]
    fn yaml_to_csv_str_string() {
        assert_eq!(yaml_to_csv_str(&Value::from("hello world")), "hello world");
    }

    #[test]
    fn yaml_to_csv_str_complex_is_json() {
        let v: Value = serde_yaml::from_str("key: val").unwrap();
        let s = yaml_to_csv_str(&v);
        assert!(s.contains("key") && s.contains("val"));
    }

    // ── parse_yaml_to_index ──────────────────────────────────────────────────

    #[test]
    fn parse_yaml_to_index_basic() {
        let yaml: Vec<Value> =
            serde_yaml::from_str("- id: 1\n  name: foo\n- id: 2\n  name: bar").unwrap();
        let idx = parse_yaml_to_index(&yaml);
        assert_eq!(idx.len(), 2);
        assert!(idx.contains_key(&1));
        assert!(idx.contains_key(&2));
    }

    #[test]
    fn parse_yaml_to_index_skips_entries_without_id() {
        let yaml: Vec<Value> =
            serde_yaml::from_str("- name: no_id\n- id: 5\n  name: has_id").unwrap();
        let idx = parse_yaml_to_index(&yaml);
        assert_eq!(idx.len(), 1);
        assert!(idx.contains_key(&5));
    }

    #[test]
    fn parse_yaml_to_index_last_entry_wins_on_duplicate_id() {
        let yaml: Vec<Value> =
            serde_yaml::from_str("- id: 1\n  name: first\n- id: 1\n  name: second").unwrap();
        let idx = parse_yaml_to_index(&yaml);
        assert_eq!(idx.len(), 1);
        let name = idx[&1].get("name").and_then(|v| v.as_str()).unwrap_or("");
        assert_eq!(name, "second");
    }

    // ── WindowDef::from_label ────────────────────────────────────────────────

    #[test]
    fn window_def_hours() {
        let w = WindowDef::from_label("6h");
        assert_eq!(w.duration, Duration::from_secs(6 * 3600));
        assert_eq!(w.label, "6h");
    }

    #[test]
    fn window_def_days() {
        let w = WindowDef::from_label("30d");
        assert_eq!(w.duration, Duration::from_secs(30 * 86400));
    }

    #[test]
    #[should_panic]
    fn window_def_invalid_unit_panics() {
        WindowDef::from_label("3w");
    }

    // ── build_output_repo ────────────────────────────────────────────────────

    #[test]
    fn build_output_repo_adds_stars_now_and_diffs() {
        let base: Value = serde_yaml::from_str("id: 1\nname: foo").unwrap();
        let mut diffs = Mapping::new();
        diffs.insert(Value::from("7d"), Value::from(42i64));
        let out = build_output_repo(base, 1000, diffs);
        assert_eq!(get_i64_field(&out, "stars_now"), Some(1000));
        assert_eq!(get_nested_i64(&out, &["stars_diff", "7d"]), Some(42));
    }

    #[test]
    fn build_output_repo_preserves_existing_fields() {
        let base: Value = serde_yaml::from_str("id: 99\nname: bar").unwrap();
        let out = build_output_repo(base, 0, Mapping::new());
        assert_eq!(get_i64_field(&out, "id"), Some(99));
    }

    // ── sort_repos ───────────────────────────────────────────────────────────

    #[test]
    fn sort_repos_orders_by_first_window_descending() {
        let mut repos: Vec<Value> = vec![
            serde_yaml::from_str("id: 1\nstars_diff:\n  6h: 1").unwrap(),
            serde_yaml::from_str("id: 2\nstars_diff:\n  6h: 10").unwrap(),
            serde_yaml::from_str("id: 3\nstars_diff:\n  6h: 5").unwrap(),
        ];
        sort_repos(&mut repos);
        assert_eq!(get_i64_field(&repos[0], "id"), Some(2));
        assert_eq!(get_i64_field(&repos[1], "id"), Some(3));
        assert_eq!(get_i64_field(&repos[2], "id"), Some(1));
    }

    #[test]
    fn sort_repos_tiebreaks_on_next_window() {
        // both have 6h=5; differ on 12h
        let mut repos: Vec<Value> = vec![
            serde_yaml::from_str("id: 1\nstars_diff:\n  6h: 5\n  12h: 2").unwrap(),
            serde_yaml::from_str("id: 2\nstars_diff:\n  6h: 5\n  12h: 8").unwrap(),
        ];
        sort_repos(&mut repos);
        assert_eq!(get_i64_field(&repos[0], "id"), Some(2));
        assert_eq!(get_i64_field(&repos[1], "id"), Some(1));
    }

    // ── result_to_csv ────────────────────────────────────────────────────────

    #[test]
    fn result_to_csv_headers_include_all_windows() {
        let repos: Vec<Value> =
            vec![serde_yaml::from_str("id: 1\nstars_diff:\n  6h: 5").unwrap()];
        let csv = result_to_csv(&repos).unwrap();
        let s = String::from_utf8(csv).unwrap();
        for w in windows() {
            assert!(s.contains(&format!("stars_{}", w.label)), "missing header stars_{}", w.label);
        }
    }

    #[test]
    fn result_to_csv_row_values() {
        let repos: Vec<Value> =
            vec![serde_yaml::from_str("id: 1\nname: testRepo\nstars_diff:\n  6h: 7").unwrap()];
        let csv = result_to_csv(&repos).unwrap();
        let s = String::from_utf8(csv).unwrap();
        assert!(s.contains("testRepo"));
        assert!(s.contains('7'));
    }

    #[test]
    fn result_to_csv_empty_input_only_header() {
        let csv = result_to_csv(&[]).unwrap();
        let s = String::from_utf8(csv).unwrap();
        // header row must still exist with window columns
        assert!(s.contains("stars_6h"));
        // only one line (the header)
        let lines: Vec<&str> = s.lines().collect();
        assert_eq!(lines.len(), 1);
    }

    // ── build_repo_diffs ─────────────────────────────────────────────────────

    #[test]
    fn build_repo_diffs_no_snapshots_all_zero() {
        let snapshots: HashMap<String, HashMap<i64, Value>> = HashMap::new();
        let diffs = build_repo_diffs(1, 500, &snapshots);
        for w in windows() {
            let val = diffs.get(&Value::from(w.label)).and_then(|v| v.as_i64());
            assert_eq!(val, Some(0), "window {} should be 0 when missing", w.label);
        }
    }

    #[test]
    fn build_repo_diffs_with_snapshot() {
        let old_repo: Value = serde_yaml::from_str("id: 42\nstars: 300").unwrap();
        let mut window_snap: HashMap<i64, Value> = HashMap::new();
        window_snap.insert(42, old_repo);
        let mut snapshots: HashMap<String, HashMap<i64, Value>> = HashMap::new();
        snapshots.insert("6h".to_string(), window_snap);

        let diffs = build_repo_diffs(42, 500, &snapshots);
        let diff_6h = diffs.get(&Value::from("6h")).and_then(|v| v.as_i64());
        assert_eq!(diff_6h, Some(200)); // 500 - 300
    }
}

fn main() -> Result<()> {
    // initialize logger (respect RUST_LOG or default to info)
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("📊 Generating multi-window star diffs (Rust)");

    let start_all = Instant::now();

    let data_dir = data_repo_dir()?;
    let current_yaml = data_dir.join("repos.yaml");
    let output_yaml        = data_dir.join("repos_diff.yaml");
    let output_json        = data_dir.join("repos_diff.json");
    let output_json_pretty = data_dir.join("repos_diff.pretty.json");
    let output_json5       = data_dir.join("repos_diff.json5");
    let output_bson        = data_dir.join("repos_diff.bson");
    let output_csv         = data_dir.join("repos_diff.csv");

    let repo = Repository::open(&data_dir).context("opening data repo")?;

    let t0 = Instant::now();
    let new_data = load_yaml_from_file(&current_yaml)?;
    anyhow::ensure!(!new_data.is_empty(), "repos.yaml loaded 0 entries — aborting");
    let input_bytes = fs::metadata(&current_yaml).map(|m| m.len()).unwrap_or(0);
    info!("📦 {:>10?}  Current repos: {}  ({} bytes)", t0.elapsed(), new_data.len(), fmt_bytes(input_bytes));

    // Build snapshots
    let now = Utc::now();
    let now_ts = now.timestamp();

    let mut snapshots: HashMap<String, HashMap<i64, Value>> = HashMap::new();
    for w in windows().iter() {
        let ts = now_ts - w.duration.as_secs() as i64;
        let tw = Instant::now();
        match find_commit_before(&repo, "master", ts)? {
            Some((oid, commit_time)) => {
                let v = load_yaml_from_commit(&repo, oid, Path::new("repos.yaml"))?;
                let delta_secs = ts - commit_time;
                let delta_str = {
                    let (d, rem) = (delta_secs / 86400, delta_secs % 86400);
                    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
                    if d > 0 { format!("{}d{}h", d, h) } else if h > 0 { format!("{}h{}m", h, m) } else { format!("{}m{}s", m, s) }
                };
                info!("⏪ {:>10?}  ({}) target {} → actual {} [Δ-{}] — {} entries",
                    tw.elapsed(), w.label,
                    Utc.timestamp_opt(ts, 0).single().unwrap_or_default(),
                    Utc.timestamp_opt(commit_time, 0).single().unwrap_or_default(),
                    delta_str, v.len());
                snapshots.insert(w.label.to_string(), parse_yaml_to_index(&v));
            }
            None => {
                warn!("⚠️ No commit found for window {}", w.label);
                snapshots.insert(w.label.to_string(), HashMap::new());
            }
        }
    }
    debug!("Finished loading snapshots");

    // Compute diffs
    let t1 = Instant::now();
    let new_index = parse_yaml_to_index(&new_data);
    let mut result: Vec<Value> = Vec::new();

    for (repo_id, repo_val) in new_index.iter() {
        let stars_now = get_i64_field(repo_val, "stars").unwrap_or(0);
        let diffs = build_repo_diffs(*repo_id, stars_now, &snapshots);
        if !has_any_change(&diffs) {
            continue;
        }
        result.push(build_output_repo(repo_val.clone(), stars_now, diffs));
    }

    sort_repos(&mut result);

    info!("🔥 {} repos changed (diff compute {:?})", result.len(), t1.elapsed());

    // Save result — timed per format
    macro_rules! timed_write {
        ($path:expr, $data:expr) => {{
            let data = $data;
            let size = data.len() as u64;
            let t = Instant::now();
            fs::write(&$path, data)?;
            info!("💾 {:>12?}  {:>15} bytes  {}", t.elapsed(), fmt_bytes(size), $path.file_name().unwrap().to_string_lossy());
        }};
    }
    timed_write!(output_csv,         result_to_csv(&result)?);
    timed_write!(output_yaml,        serde_yaml::to_string(&result)?);
    timed_write!(output_json,        serde_json::to_string(&result)?);
    timed_write!(output_json_pretty, serde_json::to_string_pretty(&result)?);
    timed_write!(output_json5,       json5::to_string(&result)?);
    timed_write!(output_bson,        bson::to_vec(&bson::doc! { "repos": bson::to_bson(&result)? })?);
    info!("Total run time: {:?}", start_all.elapsed());

    Ok(())
}

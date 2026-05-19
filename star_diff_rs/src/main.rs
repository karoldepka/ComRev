use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use git2::{Oid, Repository};
use log::{debug, error, info, trace, warn};
use env_logger;
use regex::Regex;
use serde_json;
use serde_yaml::{Mapping, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime};

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
    if !path.exists() {
        return Ok(vec![]);
    }
    debug!("Reading YAML file: {}", path.display());
    let s = fs::read_to_string(path)?;
    debug!("Read {} bytes from {}", s.len(), path.display());
    let v: Vec<Value> = serde_yaml::from_str(&s).unwrap_or_default();
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
    let v: Vec<Value> = serde_yaml::from_str(content).unwrap_or_default();
    Ok(v)
}

fn find_commit_before(repo: &Repository, branch: &str, target_ts: i64) -> Result<Option<Oid>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.push_ref(format!("refs/heads/{}", branch).as_str()).ok();
    for oid_res in revwalk {
        let oid = oid_res?;
        let commit = repo.find_commit(oid)?;
        let commit_time = commit.time().seconds();
        if commit_time <= target_ts {
            trace!("find_commit_before: chosen commit {} at {} (target {})", oid, Utc.timestamp_opt(commit_time, 0).single().unwrap_or_default(), Utc.timestamp_opt(target_ts, 0).single().unwrap_or_default());
            return Ok(Some(oid));
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

fn main() -> Result<()> {
    // initialize logger (respect RUST_LOG or default to info)
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("📊 Generating multi-window star diffs (Rust)");

    let start_all = Instant::now();

    let data_dir = data_repo_dir()?;
    let current_yaml = data_dir.join("repos.yaml");
    let output_yaml  = data_dir.join("repos_diff.yaml");
    let output_json  = data_dir.join("repos_diff.json");
    let output_json5 = data_dir.join("repos_diff.json5");

    let repo = Repository::open(&data_dir).context("opening data repo")?;

    let t0 = Instant::now();
    let new_data = load_yaml_from_file(&current_yaml)?;
    info!("📦 Current repos: {} (loaded in {:?})", new_data.len(), t0.elapsed());

    // Build snapshots
    let now = Utc::now();
    let now_ts = now.timestamp();

    let mut snapshots: HashMap<String, HashMap<i64, Value>> = HashMap::new();
    for w in windows().iter() {
        let ts = now_ts - w.duration.as_secs() as i64;
        let tw = Instant::now();
        match find_commit_before(&repo, "master", ts)? {
            Some(oid) => {
                info!("⏪ Found commit ({}) → target {}", w.label, Utc.timestamp_opt(ts, 0).single().unwrap_or_default());
                let v = load_yaml_from_commit(&repo, oid, Path::new("repos.yaml"))?;
                debug!("Loaded snapshot {} entries for {} in {:?}", v.len(), w.label, tw.elapsed());
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

    // Save result
    let t2 = Instant::now();
    fs::write(&output_yaml,  serde_yaml::to_string(&result)?)?;
    fs::write(&output_json,  serde_json::to_string_pretty(&result)?)?;
    fs::write(&output_json5, json5::to_string(&result)?)?;

    info!("🔥 {} repos changed (diff compute {:?})", result.len(), t1.elapsed());
    info!("💾 Saved → {}, .json, .json5 (write {:?})", output_yaml.display(), t2.elapsed());
    info!("Total run time: {:?}", start_all.elapsed());

    Ok(())
}

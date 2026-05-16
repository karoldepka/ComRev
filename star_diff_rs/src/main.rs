use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use git2::{Oid, Repository};
use serde_yaml::{Mapping, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const MISSING_AS_ZERO: bool = true;

fn data_repo_dir() -> Result<PathBuf> {
    let cwd = std::env::current_dir()?;
    // assume repo root contains this folder; mirror Python: ../ComRev_Data
    let base = cwd;
    let data = base.join("..").join("..").join("ComRev_Data");
    Ok(data.canonicalize().unwrap_or(data))
}

fn load_yaml_from_file(path: &Path) -> Result<Vec<Value>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(path)?;
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
    for label in ["6h","12h","24h","48h","5d","7d","10d","14d"].iter() {
        let old_repo = snapshots.get(&label.to_string()).and_then(|s| s.get(&repo_id));
        let diff = compute_star_diff(stars_now, old_repo);
        m.insert(Value::from(*label), Value::from(diff));
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
        let get_48 = |v: &Value| get_nested_i64(v, &["stars_diff", "48h"]).unwrap_or(0);
        let get_24 = |v: &Value| get_nested_i64(v, &["stars_diff", "24h"]).unwrap_or(0);
        let get_now = |v: &Value| get_i64_field(v, "stars_now").unwrap_or(0);

        get_48(b).cmp(&get_48(a))
            .then(get_24(b).cmp(&get_24(a)))
            .then(get_now(b).cmp(&get_now(a)))
    });
}

fn main() -> Result<()> {
    println!("📊 Generating multi-window star diffs (Rust)");

    let data_dir = data_repo_dir()?;
    let current_yaml = data_dir.join("repos.yaml");
    let output_yaml = data_dir.join("repos_diff.yaml");

    let repo = Repository::open(&data_dir).context("opening data repo")?;

    let new_data = load_yaml_from_file(&current_yaml)?;
    println!("📦 Current repos: {}", new_data.len());

    // Build snapshots
    let now = Utc::now();
    let windows: Vec<(String, i64)> = vec![
        ("6h".into(), (now - chrono::Duration::hours(6)).timestamp()),
        ("12h".into(), (now - chrono::Duration::hours(12)).timestamp()),
        ("24h".into(), (now - chrono::Duration::hours(24)).timestamp()),
        ("48h".into(), (now - chrono::Duration::hours(48)).timestamp()),
        ("5d".into(), (now - chrono::Duration::days(5)).timestamp()),
        ("7d".into(), (now - chrono::Duration::days(7)).timestamp()),
        ("10d".into(), (now - chrono::Duration::days(10)).timestamp()),
        ("14d".into(), (now - chrono::Duration::days(14)).timestamp()),
    ];

    let mut snapshots: HashMap<String, HashMap<i64, Value>> = HashMap::new();
    for (label, ts) in windows.iter() {
        match find_commit_before(&repo, "master", *ts)? {
            Some(oid) => {
                println!("⏪ Found commit ({}) → {}", label, Utc.timestamp(*ts, 0));
                let v = load_yaml_from_commit(&repo, oid, Path::new("repos.yaml"))?;
                snapshots.insert(label.clone(), parse_yaml_to_index(&v));
            }
            None => {
                println!("⚠️ No commit found for window {}", label);
                snapshots.insert(label.clone(), HashMap::new());
            }
        }
    }

    // Compute diffs
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
    let s = serde_yaml::to_string(&result)?;
    fs::write(&output_yaml, s)?;

    println!("🔥 {} repos changed", result.len());
    println!("💾 Saved → {}", output_yaml.display());

    Ok(())
}

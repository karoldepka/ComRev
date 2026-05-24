use anyhow::{Context, Result};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::{
    collections::VecDeque,
    env,
    fs as stdfs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Instant,
};
use tokio::{
    fs,
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{mpsc, Semaphore},
};
use tracing::{error, info, warn};
use walkdir::WalkDir;
use shlex::Shlex;

#[derive(Debug, Clone)]
struct RepoJob {
    url: String,
}

#[derive(Debug, Clone)]
struct InstallTask {
    repo_name: String,
    path: PathBuf,
    platform: Platform,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    //
    // JS/TS
    //

    Npm,
    Pnpm,
    Yarn,
    Bun,

    //
    // Rust
    //

    Cargo,

    //
    // Python
    //

    Uv,
    Poetry,
    Pip,

    //
    // Other
    //

    Go,
    Maven,
    Gradle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Clone,
    Install,
    Build,
    Check,
    Test,
    Run,
    Dev,
    Print,
    Open,
}

impl Mode {
    fn from_str(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "clone" => Some(Mode::Clone),
            "install" => Some(Mode::Install),
            "build" => Some(Mode::Build),
            "check" => Some(Mode::Check),
            "test" => Some(Mode::Test),
            "run" | "start" => Some(Mode::Run),
            "dev" => Some(Mode::Dev),
            "print" => Some(Mode::Print),
            "open" => Some(Mode::Open),
            _ => None,
        }
    }
}

#[derive(Debug)]
struct PlatformDefinition {
    platform: Platform,

    display_name: &'static str,

    install_command: &'static str,

    install_args: &'static [&'static str],

    detection_files: &'static [&'static str],

    install_check_paths: &'static [&'static str],
}

const PLATFORM_DEFINITIONS: &[PlatformDefinition] = &[
    //
    // JS/TS
    //

    PlatformDefinition {
        platform: Platform::Pnpm,
        display_name: "pnpm",
        install_command: "pnpm",
        install_args: &[
            "install",
            "--frozen-lockfile",
        ],
        detection_files: &[
            "pnpm-lock.yaml",
        ],
        install_check_paths: &[
            "node_modules",
        ],
    },

    PlatformDefinition {
        platform: Platform::Yarn,
        display_name: "yarn",
        install_command: "yarn",
        install_args: &[
            "install",
            "--frozen-lockfile",
        ],
        detection_files: &[
            "yarn.lock",
        ],
        install_check_paths: &[
            "node_modules",
        ],
    },

    PlatformDefinition {
        platform: Platform::Bun,
        display_name: "bun",
        install_command: "bun",
        install_args: &[
            "install",
        ],
        detection_files: &[
            "bun.lock",
            "bun.lockb",
        ],
        install_check_paths: &[
            "node_modules",
        ],
    },

    PlatformDefinition {
        platform: Platform::Npm,
        display_name: "npm",
        install_command: "npm",
        install_args: &[
            "install",
        ],
        detection_files: &[
            "package.json",
        ],
        install_check_paths: &[
            "node_modules",
        ],
    },

    //
    // Rust
    //

    PlatformDefinition {
        platform: Platform::Cargo,
        display_name: "cargo",
        install_command: "cargo",
        install_args: &[
            "fetch",
        ],
        detection_files: &[
            "Cargo.toml",
        ],
        install_check_paths: &[
            "target",
        ],
    },

    //
    // Python
    //

    PlatformDefinition {
        platform: Platform::Uv,
        display_name: "uv",
        install_command: "uv",
        install_args: &[
            "sync",
        ],
        detection_files: &[
            "uv.lock",
            "pyproject.toml",
        ],
        install_check_paths: &[
            ".venv",
        ],
    },

    PlatformDefinition {
        platform: Platform::Poetry,
        display_name: "poetry",
        install_command: "poetry",
        install_args: &[
            "install",
        ],
        detection_files: &[
            "poetry.lock",
        ],
        install_check_paths: &[
            ".venv",
        ],
    },

    PlatformDefinition {
        platform: Platform::Pip,
        display_name: "pip",
        install_command: "pip",
        install_args: &[
            "install",
            "-r",
            "requirements.txt",
        ],
        detection_files: &[
            "requirements.txt",
        ],
        install_check_paths: &[
            ".venv",
        ],
    },

    //
    // Go
    //

    PlatformDefinition {
        platform: Platform::Go,
        display_name: "go",
        install_command: "go",
        install_args: &[
            "mod",
            "download",
        ],
        detection_files: &[
            "go.mod",
        ],
        install_check_paths: &[],
    },

    //
    // Java
    //

    PlatformDefinition {
        platform: Platform::Maven,
        display_name: "maven",
        install_command: "mvn",
        install_args: &[
            "dependency:resolve",
        ],
        detection_files: &[
            "pom.xml",
        ],
        install_check_paths: &[],
    },

    PlatformDefinition {
        platform: Platform::Gradle,
        display_name: "gradle",
        install_command: "gradle",
        install_args: &[
            "dependencies",
        ],
        detection_files: &[
            "build.gradle",
            "build.gradle.kts",
        ],
        install_check_paths: &[],
    },
];

impl Platform {
    fn definition(
        &self,
    ) -> &'static PlatformDefinition {
        PLATFORM_DEFINITIONS
            .iter()
            .find(|d| d.platform == *self)
            .unwrap()
    }

    fn display_name(
        &self,
    ) -> &'static str {
        self.definition().display_name
    }

    fn install_command(
        &self,
    ) -> (
        &'static str,
        &'static [&'static str],
    ) {
        let def = self.definition();

        (
            def.install_command,
            def.install_args,
        )
    }
}

fn print_usage() {
    println!("Usage: repo-dman <action> [OPTIONS] [REPO...]");
    println!();
    println!("Actions:");
    println!("  clone   Clone repositories and scan for projects");
    println!("  install Clone repositories and install dependencies");
    println!("  build   Clone repositories and install dependencies");
    println!("  check   Clone repositories and install dependencies");
    println!("  test    Clone repositories and install dependencies");
    println!("  print   Print project metadata files recursively (breadth-first)");
    println!("  open    Clone repositories and open project roots in VS Code");
    println!("  run     Clone repositories and install dependencies");
    println!("  start   Alias for run");
    println!("  dev     Clone repositories and install dependencies");
    println!();
    println!("Accepts repository identifiers in multiple formats:");
    println!("  owner/repo");
    println!("  https://github.com/owner/repo");
    println!("  https://github.com/owner/repo.git");
    println!("  git@github.com:owner/repo.git");
    println!("  ssh://git@github.com/owner/repo.git");
    println!();
    println!("Options:");
    println!("  -h, --help          Show this help message");
    println!("  -f, --file <path>   Read repo list from a file (one repo per line)");
    println!("  --depth <N>         Pass --depth <N> to git clone (shallow clone)");
    println!();
    println!("Environment variables:");
    println!("  GIT_ARGS            Extra arguments appended to every git clone call");
    println!("                      (e.g. GIT_ARGS=\"--depth 1\" dman clone owner/repo)");
    println!("\nIf no repositories are specified, the current directory is scanned recursively.");
}

fn parse_repo_spec(spec: &str) -> Option<String> {
    let spec = spec.trim();

    if spec.is_empty() {
        return None;
    }

    let spec = if let Some(stripped) = spec.strip_prefix('@') {
        stripped.trim()
    } else {
        spec
    };

    let mut normalized = spec.trim_end_matches('/');

    if normalized.starts_with("git@github.com:") {
        normalized = &normalized["git@github.com:".len()..];
    } else if normalized.starts_with("ssh://git@github.com/") {
        normalized = &normalized["ssh://git@github.com/".len()..];
    } else if normalized.starts_with("https://github.com/") {
        normalized = &normalized["https://github.com/".len()..];
    } else if normalized.starts_with("http://github.com/") {
        normalized = &normalized["http://github.com/".len()..];
    } else if normalized.starts_with("github.com/") {
        normalized = &normalized["github.com/".len()..];
    }

    let normalized = normalized.trim_end_matches(".git");

    if !normalized.contains('/') {
        return None;
    }

    Some(format!(
        "https://github.com/{}",
        normalized
    ))
}

async fn parse_repos_from_args(
    args: &[String],
) -> Result<(Vec<RepoJob>, Vec<String>)> {
    let mut repos = Vec::new();
    let mut extra_git_args: Vec<String> = Vec::new();
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "-h" | "--help" => {
                print_usage();
                std::process::exit(0);
            }

            "-f" | "--file" => {
                index += 1;

                if index >= args.len() {
                    anyhow::bail!(
                        "Missing path after {}",
                        args[index - 1]
                    );
                }

                let file_path =
                    Path::new(&args[index]);

                let contents =
                    fs::read_to_string(file_path)
                        .await?;

                for line in contents.lines() {
                    let line = line.trim();

                    if line.is_empty()
                        || line.starts_with('#')
                    {
                        continue;
                    }

                    let url =
                        parse_repo_spec(line)
                            .ok_or_else(|| {
                                anyhow::anyhow!(
                                    "Invalid repository format in file: {}",
                                    line
                                )
                            })?;

                    repos.push(RepoJob {
                        url,
                    });
                }
            }

            arg if arg.starts_with('-') => {
                // Forward any unrecognized flag to git clone.
                // If the flag has no '=' and the next token isn't another
                // flag or a repo spec, consume it as the flag's value
                // (e.g. --depth 1, --branch main, --filter blob:none).
                extra_git_args.push(arg.to_string());

                if !arg.contains('=') {
                    let next_is_value = args.get(index + 1).is_some_and(|n| {
                        !n.starts_with('-') && parse_repo_spec(n).is_none()
                    });
                    if next_is_value {
                        index += 1;
                        extra_git_args.push(args[index].clone());
                    }
                }
            }

            arg => {
                if arg.starts_with('@') {
                    let file_path =
                        Path::new(&arg[1..]);

                    let contents =
                        fs::read_to_string(file_path)
                            .await?;

                    for line in contents.lines() {
                        let line = line.trim();

                        if line.is_empty()
                            || line.starts_with('#')
                        {
                            continue;
                        }

                        let url =
                            parse_repo_spec(line)
                                .ok_or_else(|| {
                                    anyhow::anyhow!(
                                        "Invalid repository format in file: {}",
                                        line
                                    )
                                })?;

                        repos.push(RepoJob {
                            url,
                        });
                    }
                } else {
                    let url =
                        parse_repo_spec(arg)
                            .ok_or_else(|| {
                                anyhow::anyhow!(
                                    "Invalid repository format: {}",
                                    arg
                                )
                            })?;

                    repos.push(RepoJob {
                        url,
                    });
                }
            }
        }

        index += 1;
    }

    Ok((repos, extra_git_args))
}

async fn parse_args(
    args: &[String],
) -> Result<(Mode, Vec<RepoJob>, Vec<String>)> {
    if args.is_empty() {
        anyhow::bail!(
            "No action specified"
        );
    }

    if args[0] == "-h"
        || args[0] == "--help"
    {
        print_usage();
        std::process::exit(0);
    }

    let mode =
        Mode::from_str(&args[0])
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Unknown action: {}. Expected clone, install, build, check, test, run, start, open, print, or dev",
                    args[0]
                )
            })?;

    let (repos, cli_git_args) =
        parse_repos_from_args(&args[1..])
            .await?;

    Ok((mode, repos, cli_git_args))
}

async fn scan_local_workspace(
    root: &Path,
    tx: Option<mpsc::Sender<InstallTask>>,
    multi: Arc<MultiProgress>,
) -> Result<()> {
    let root = root
        .canonicalize()
        .unwrap_or_else(|_| root.to_path_buf());
    let root_display = root.display().to_string();

    let scan_start = Instant::now();
    let pb = multi.add(make_spinner());
    pb.set_message(format!(
        "Scanning local workspace {}",
        root_display
    ));

    let projects =
        find_projects_recursively(&root)?;
    let project_count = projects.len();

    for project_path in projects {
        let platforms =
            detect_platforms(&project_path)
                .await?;

        let repo_name = project_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| root_display.clone());

        for platform in platforms {
            if let Some(tx) = &tx {
                tx.send(InstallTask {
                    repo_name: repo_name.clone(),
                    path: project_path.clone(),
                    platform,
                })
                .await?;
            }
        }
    }

    pb.finish_with_message(format!(
        "Scanned local workspace {} in {:.2?} ({} projects found)",
        root_display,
        scan_start.elapsed(),
        project_count
    ));

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    //
    // Repositories
    //

    let args: Vec<String> =
        env::args().skip(1).collect();

    let (mode, repos, cli_git_args) =
        if args.is_empty() {
            print_usage();

            anyhow::bail!(
                "No action specified"
            );
        } else {
            parse_args(&args).await?
        };

    // GIT_ARGS env var provides defaults; CLI flags appended after (last wins in git).
    // Parsed with shell quoting so GIT_ARGS='--config "http.proxy=http://p:8080"' works.
    let extra_git_args: Vec<String> = {
        let mut v: Vec<String> = env::var("GIT_ARGS")
            .map(|s| Shlex::new(&s).collect())
            .unwrap_or_default();
        v.extend(cli_git_args);
        v
    };

    if mode == Mode::Clone && repos.is_empty() {
        print_usage();
        anyhow::bail!("Clone mode requires at least one repository URL");
    }

    let overall_start = Instant::now();

    //
    // Check tools
    //

    check_required_tools().await;

    if mode == Mode::Print {
        let print_start = Instant::now();

        if repos.is_empty() {
            let (metadata_count, node_modules_count) =
                print_metadata_recursively(&PathBuf::from("."))?;
            info!(
                "Summary: {} metadata files, {} node_modules directories",
                metadata_count,
                node_modules_count
            );
        } else {
            let mut total_metadata = 0;
            let mut total_node_modules = 0;

            for repo in &repos {
                let repo_path =
                    clone_repo_if_missing(repo, &PathBuf::from("."), &extra_git_args).await?;

                println!(
                    "Metadata for {}:",
                    repo_path.display()
                );

                let (metadata_count, node_modules_count) =
                    print_metadata_recursively(&repo_path)?;

                total_metadata += metadata_count;
                total_node_modules += node_modules_count;
            }

            info!(
                "Summary: {} metadata files, {} node_modules directories across {} repos",
                total_metadata,
                total_node_modules,
                repos.len()
            );
        }

        info!(
            "Print operation completed in {:.2?}",
            print_start.elapsed()
        );

        return Ok(());
    }

    if mode == Mode::Open {
        if repos.is_empty() {
            let roots = shallowest_project_roots(
                &find_projects_recursively(&PathBuf::from("."))?,
                &PathBuf::from("."),
            );
            open_in_vscode(&roots).await?;
        } else {
            for repo in &repos {
                let repo_path =
                    clone_repo_if_missing(repo, &PathBuf::from("."), &extra_git_args).await?;
                let projects = find_projects_recursively(&repo_path)?;
                let roots = shallowest_project_roots(&projects, &repo_path);
                open_in_vscode(&roots).await?;
            }
        }

        return Ok(());
    }

    //
    // Workspace
    //

    let workspace_dir =
        PathBuf::from(".");

    fs::create_dir_all(&workspace_dir)
        .await?;

    //
    // UI
    //

    let multi =
        Arc::new(MultiProgress::new());

    //
    // Queue
    //

    let (tx, rx) =
        if mode == Mode::Clone {
            (None, None)
        } else {
            let (tx, rx) =
                mpsc::channel::<InstallTask>(
                    100,
                );

            (Some(tx), Some(rx))
        };

    //
    // Clone concurrency
    //

    let clone_semaphore =
        Arc::new(Semaphore::new(4));

    //
    // Clone jobs
    //

    let mut clone_handles =
        Vec::new();

    if repos.is_empty() {
        if let Some(tx) = &tx {
            scan_local_workspace(
                &workspace_dir,
                Some(tx.clone()),
                multi.clone(),
            )
            .await?;
        }
    } else {
        for repo in repos {
            let tx = tx.clone();

            let workspace_dir =
                workspace_dir.clone();

            let multi = multi.clone();

            let semaphore =
                clone_semaphore.clone();

            let extra_git_args =
                extra_git_args.clone();

            let handle =
                tokio::spawn(async move {
                    let _permit =
                        semaphore
                            .acquire()
                            .await
                            .unwrap();

                    if let Err(err) =
                        clone_and_scan(
                            repo,
                            workspace_dir,
                            tx,
                            multi,
                            extra_git_args,
                        )
                        .await
                    {
                        error!("{:#}", err);
                    }
                });

            clone_handles.push(handle);
        }

        if let Some(tx) = tx {
            drop(tx);
        }
    }

    //
    // Install worker manager
    //

    let install_handle =
        if let Some(mut rx) = rx {
            let install_multi =
                multi.clone();

            Some(tokio::spawn(
                async move {
                    let install_semaphore =
                        Arc::new(
                            Semaphore::new(6),
                        );

                    while let Some(task) =
                        rx.recv().await
                    {
                        let semaphore =
                            install_semaphore
                                .clone();

                        let multi =
                            install_multi
                                .clone();

                        tokio::spawn(
                            async move {
                                let _permit =
                                    semaphore
                                        .acquire()
                                        .await
                                        .unwrap();

                                if let Err(err) =
                                    install_dependencies(
                                        task,
                                        multi,
                                    )
                                    .await
                                {
                                    error!(
                                        "{:#}",
                                        err
                                    );
                                }
                            },
                        );
                    }
                },
            ))
        } else {
            None
        };

    //
    // Wait for clones
    //

    for handle in clone_handles {
        handle.await?;
    }

    //
    // Wait for installs
    //

    if let Some(handle) =
        install_handle
    {
        handle.await?;
    }

    info!(
        "All operations completed in {:.2?}",
        overall_start.elapsed()
    );

    Ok(())
}

async fn clone_and_scan(
    repo: RepoJob,
    workspace_dir: PathBuf,
    tx: Option<mpsc::Sender<InstallTask>>,
    multi: Arc<MultiProgress>,
    extra_git_args: Vec<String>,
) -> Result<()> {
    let repo_name = repo
        .url
        .split('/')
        .last()
        .unwrap()
        .replace(".git", "");

    let repo_path =
        workspace_dir.join(&repo_name);

    let start = Instant::now();
    let pb = multi.add(make_spinner());

    pb.set_message(format!(
        "Cloning {} -> {}",
        repo_name,
        repo_path.display()
    ));

    //
    // Clone
    //

    if !repo_path.exists() {
        let repo_path_str =
            repo_path
                .to_string_lossy()
                .to_string();

        let mut clone_args: Vec<String> =
            vec!["clone".to_string()];
        clone_args.extend(extra_git_args);
        clone_args.push(repo.url.clone());
        clone_args.push(repo_path_str);
        let clone_args_ref: Vec<&str> =
            clone_args.iter().map(|s| s.as_str()).collect();

        let status =
            run_command_with_prefix(
                "git",
                &clone_args_ref,
                None,
                &format!(
                    "[{}] git",
                    repo_name
                ),
            )
            .await
            .context(
                "failed to execute git clone",
            )?;

        if !status.success() {
            anyhow::bail!(
                "git clone failed with status {}",
                status
            );
        }
    }

    pb.set_message(format!(
        "Scanning {} ({})",
        repo_name,
        repo_path.display()
    ));

    //
    // Find projects recursively
    //

    let projects =
        find_projects_recursively(
            &repo_path,
        )?;
    let project_count = projects.len();

    //
    // Queue installs
    //

    for project_path in projects {
        let platforms =
            detect_platforms(
                &project_path,
            )
            .await?;

        for platform in platforms {
            if let Some(tx) = &tx {
                tx.send(InstallTask {
                    repo_name:
                        repo_name.clone(),

                    path:
                        project_path.clone(),

                    platform,
                })
                .await?;
            }
        }
    }

    pb.finish_with_message(format!(
        "Scanned {} in {:.2?} ({} projects found)",
        repo_name,
        start.elapsed(),
        project_count
    ));

    Ok(())
}

fn find_projects_recursively(
    root: &Path,
) -> Result<Vec<PathBuf>> {
    let mut projects = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(true)
    {
        let entry = entry?;

        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();

        //
        // Skip generated folders
        //

        let skip = [
            "node_modules",
            ".git",
            "dist",
            "build",
            "target",
            ".next",
            ".venv",
        ];

        if path.components().any(|c| {
            skip.contains(
                &c.as_os_str()
                    .to_string_lossy()
                    .as_ref(),
            )
        }) {
            continue;
        }

        //
        // Detect project roots
        //

        let markers = [
            "package.json",
            "Cargo.toml",
            "pyproject.toml",
            "requirements.txt",
            "go.mod",
            "pom.xml",
            "build.gradle",
            "build.gradle.kts",
        ];

        let is_project =
            markers.iter().any(|m| {
                path.join(m).exists()
            });

        if is_project {
            projects.push(
                path.to_path_buf(),
            );
        }
    }

    Ok(projects)
}

async fn detect_platforms(
    path: &Path,
) -> Result<Vec<Platform>> {
    let mut found = Vec::new();

    for def in PLATFORM_DEFINITIONS {
        let detected = def
            .detection_files
            .iter()
            .any(|file| {
                path.join(file).exists()
            });

        if detected {
            found.push(def.platform);
        }
    }

    Ok(found)
}

async fn install_dependencies(
    task: InstallTask,
    multi: Arc<MultiProgress>,
) -> Result<()> {
    let install_start = Instant::now();
    let pb = multi.add(make_spinner());

    pb.set_message(format!(
        "[{}] Installing {} at {}",
        task.repo_name,
        task.platform.display_name(),
        task.path.display()
    ));

    //
    // Skip if already installed
    //

    if already_installed(
        &task.path,
        &task.platform,
    ) {
        pb.finish_with_message(format!(
            "[{}] {} already installed at {}",
            task.repo_name,
            task.platform.display_name(),
            task.path.display()
        ));

        return Ok(());
    }

    //
    // UV setup
    //

    if matches!(
        task.platform,
        Platform::Uv
    ) {
        prepare_uv_environment(
            &task.path,
        )
        .await?;
    }

    //
    // Execute install
    //

    let (cmd, args) =
        task.platform.install_command();

    let status =
        run_command_with_prefix(
            cmd,
            args,
            Some(&task.path),
            &format!(
                "[{}] {}",
                task.repo_name,
                task.platform
                    .display_name()
            ),
        )
        .await
        .with_context(|| {
            format!(
                "failed to run {}",
                cmd
            )
        })?;

    if !status.success() {
        warn!(
            "[{}] {} failed with status {}",
            task.repo_name,
            task.platform
                .display_name(),
            status
        );

        pb.finish_with_message(format!(
            "[{}] {} failed after {:.2?}",
            task.repo_name,
            task.platform
                .display_name(),
            install_start.elapsed()
        ));

        return Ok(());
    }

    pb.finish_with_message(format!(
        "[{}] {} installed at {} in {:.2?}",
        task.repo_name,
        task.platform.display_name(),
        task.path.display(),
        install_start.elapsed()
    ));

    Ok(())
}

fn already_installed(
    path: &Path,
    platform: &Platform,
) -> bool {
    platform
        .definition()
        .install_check_paths
        .iter()
        .any(|p| path.join(p).exists())
}

async fn prepare_uv_environment(
    path: &Path,
) -> Result<()> {
    let venv_path =
        path.join(".venv");

    if venv_path.exists() {
        return Ok(());
    }

    let status =
        run_command_with_prefix(
            "uv",
            &["venv"],
            Some(path),
            &format!(
                "[uv] {}",
                path.display()
            ),
        )
        .await?;

    if !status.success() {
        anyhow::bail!(
            "uv venv failed with status {}",
            status
        );
    }

    Ok(())
}

async fn clone_repo_if_missing(
    repo: &RepoJob,
    workspace_dir: &Path,
    extra_git_args: &[String],
) -> Result<PathBuf> {
    let repo_name = repo
        .url
        .split('/')
        .last()
        .unwrap()
        .replace(".git", "");

    let repo_path = workspace_dir.join(&repo_name);

    if repo_path.exists() {
        return Ok(repo_path);
    }

    let repo_path_str = repo_path
        .to_string_lossy()
        .to_string();

    let mut clone_args: Vec<String> =
        vec!["clone".to_string()];
    clone_args.extend(extra_git_args.iter().cloned());
    clone_args.push(repo.url.clone());
    clone_args.push(repo_path_str);
    let clone_args_ref: Vec<&str> =
        clone_args.iter().map(|s| s.as_str()).collect();

    let status = run_command_with_prefix(
        "git",
        &clone_args_ref,
        None,
        &format!("[{}] git", repo_name),
    )
    .await?;

    if !status.success() {
        anyhow::bail!(
            "git clone failed with status {}",
            status
        );
    }

    Ok(repo_path)
}

fn is_metadata_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    match path
        .file_name()
        .and_then(|name| name.to_str())
    {
        Some("package-lock.json")
        | Some("pnpm-lock.yaml")
        | Some("yarn.lock")
        | Some("bun.lock")
        | Some("bun.lockb")
        | Some("package.json")
        | Some("Cargo.toml")
        | Some("pyproject.toml")
        | Some("requirements.txt")
        | Some("go.mod")
        | Some("pom.xml")
        | Some("build.gradle")
        | Some("build.gradle.kts") => true,
        _ => false,
    }
}

fn print_metadata_recursively(
    root: &Path,
) -> Result<(usize, usize)> {
    let start = Instant::now();
    let mut metadata_count = 0;
    let mut node_modules_count = 0;
    let mut queue = VecDeque::new();
    queue.push_back(root.to_path_buf());

    while let Some(dir) = queue.pop_front() {
        let read_dir = stdfs::read_dir(&dir)
            .with_context(|| {
                format!(
                    "failed to read directory {}",
                    dir.display()
                )
            })?;

        for entry in read_dir {
            let entry = entry?;
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();

            if path.is_dir() {
                if name == "node_modules" {
                    println!("{}", path.display());
                    node_modules_count += 1;
                    continue;
                }

                if matches!(
                    name,
                    ".git"
                        | "target"
                        | "dist"
                        | "build"
                        | ".next"
                        | ".venv"
                        | "__pycache__"
                ) {
                    continue;
                }

                queue.push_back(path);
            } else if is_metadata_file(&path) {
                println!("{}", path.display());
                metadata_count += 1;
            }
        }
    }

    println!(
        "Metadata scan completed in {:.2?}",
        start.elapsed()
    );
    println!(
        "Found {} metadata files and {} node_modules directories",
        metadata_count,
        node_modules_count
    );

    Ok((metadata_count, node_modules_count))
}

async fn check_required_tools() {
    let tools = vec![
        "git",
        "npm",
        "pnpm",
        "yarn",
        "bun",
        "cargo",
        "uv",
        "poetry",
        "pip",
        "go",
        "mvn",
        "gradle",
    ];

    for tool in tools {
        if !command_exists(tool).await {
            warn!(
                "{} is not installed or not in PATH",
                tool
            );
        }
    }
}

async fn command_exists(
    cmd: &str,
) -> bool {
    let mut direct =
        Command::new(cmd);

    direct.arg("--version");

    if direct.output().await.is_ok() {
        return true;
    }

    if cfg!(windows) {
        let mut fallback =
            Command::new("cmd");

        fallback
            .arg("/C")
            .arg(cmd)
            .arg("--version");

        return fallback
            .output()
            .await
            .is_ok();
    }

    false
}

async fn run_command_with_prefix(
    cmd: &str,
    args: &[&str],
    cwd: Option<&Path>,
    prefix: &str,
) -> Result<std::process::ExitStatus>
{
    let mut command =
        Command::new(cmd);

    command.args(args);

    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let start = Instant::now();
    let mut child =
        match command.spawn() {
            Ok(child) => child,

            Err(_err) if cfg!(windows) => {
                let mut fallback =
                    Command::new("cmd");

                fallback
                    .arg("/C")
                    .arg(cmd)
                    .args(args);

                if let Some(cwd) = cwd {
                    fallback.current_dir(cwd);
                }

                fallback
                    .stdout(
                        Stdio::piped(),
                    )
                    .stderr(
                        Stdio::piped(),
                    );

                fallback
                    .spawn()
                    .with_context(|| {
                        format!(
                            "failed to spawn fallback Windows shell for command {}",
                            cmd
                        )
                    })?
            }

            Err(err) => {
                return Err(err).context(
                    format!(
                        "failed to spawn {}",
                        cmd
                    ),
                );
            }
        };

    let stdout = child
        .stdout
        .take()
        .expect("stdout piped");

    let stderr = child
        .stderr
        .take()
        .expect("stderr piped");

    let mut stdout =
        BufReader::new(stdout).lines();

    let mut stderr =
        BufReader::new(stderr).lines();

    let prefix_stdout =
        prefix.to_string();

    let prefix_stderr =
        prefix.to_string();

    let stdout_handle =
        tokio::spawn(async move {
            while let Ok(Some(line)) =
                stdout.next_line().await
            {
                println!(
                    "{} [stdout] {}",
                    prefix_stdout,
                    line
                );
            }
        });

    let stderr_handle =
        tokio::spawn(async move {
            while let Ok(Some(line)) =
                stderr.next_line().await
            {
                eprintln!(
                    "{} [stderr] {}",
                    prefix_stderr,
                    line
                );
            }
        });

    let status =
        child.wait().await?;

    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    println!(
        "{} [info] command completed in {:.2?}",
        prefix,
        start.elapsed()
    );

    Ok(status)
}

// Returns the shallowest project roots — drops any path whose ancestor is already in the set.
fn shallowest_project_roots(
    projects: &[PathBuf],
    repo_root: &Path,
) -> Vec<PathBuf> {
    // If the repo root itself is a project, just return it — nothing more specific needed.
    if projects.iter().any(|p| p == repo_root) {
        return vec![repo_root.to_path_buf()];
    }

    let mut roots: Vec<PathBuf> = Vec::new();

    // Sort by component count so shallower paths are processed first.
    let mut sorted = projects.to_vec();
    sorted.sort_by_key(|p| p.components().count());

    'outer: for path in sorted {
        for existing in &roots {
            if path.starts_with(existing) {
                continue 'outer;
            }
        }
        roots.push(path);
    }

    if roots.is_empty() {
        roots.push(repo_root.to_path_buf());
    }

    roots
}

async fn open_in_vscode(paths: &[PathBuf]) -> Result<()> {
    for path in paths {
        info!("Opening {} in VS Code", path.display());

        let path_str = path.to_string_lossy().to_string();

        let status = Command::new("code")
            .arg(&path_str)
            .status()
            .await;

        if status.is_err() && cfg!(windows) {
            Command::new("cmd")
                .args(["/C", "code", &path_str])
                .status()
                .await
                .with_context(|| {
                    format!("failed to open VS Code for {}", path.display())
                })?;
        } else {
            status.with_context(|| {
                format!("failed to open VS Code for {}", path.display())
            })?;
        }
    }

    Ok(())
}

fn make_spinner() -> ProgressBar {
    let pb =
        ProgressBar::new_spinner();

    pb.set_style(
        ProgressStyle::with_template(
            "{spinner:.green} {msg}",
        )
        .unwrap(),
    );

    pb.enable_steady_tick(
        std::time::Duration::from_millis(
            120,
        ),
    );

    pb
}
use anyhow::{Context, Result};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::{
    env,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};
use tokio::{
    fs,
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{mpsc, Semaphore},
};
use tracing::{error, info, warn};
use walkdir::WalkDir;

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
    Build,
    Check,
    Test,
    Run,
    Dev,
}

impl Mode {
    fn from_str(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "clone" => Some(Mode::Clone),
            "build" => Some(Mode::Build),
            "check" => Some(Mode::Check),
            "test" => Some(Mode::Test),
            "run" => Some(Mode::Run),
            "dev" => Some(Mode::Dev),
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
    println!("  build   Clone repositories and install dependencies");
    println!("  check   Clone repositories and install dependencies");
    println!("  test    Clone repositories and install dependencies");
    println!("  run     Clone repositories and install dependencies");
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
) -> Result<Vec<RepoJob>> {
    let mut repos = Vec::new();
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

    Ok(repos)
}

async fn parse_args(
    args: &[String],
) -> Result<(Mode, Vec<RepoJob>)> {
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
                    "Unknown action: {}. Expected clone, build, check, test, run, or dev",
                    args[0]
                )
            })?;

    let repos =
        parse_repos_from_args(&args[1..])
            .await?;

    Ok((mode, repos))
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

    let pb = multi.add(make_spinner());
    pb.set_message(format!(
        "Scanning local workspace {}",
        root_display
    ));

    let projects =
        find_projects_recursively(&root)?;

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
        "Scanned local workspace {}",
        root_display
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

    let (mode, repos) =
        if args.is_empty() {
            print_usage();

            anyhow::bail!(
                "No action specified"
            );
        } else {
            parse_args(&args).await?
        };

    if mode == Mode::Clone && repos.is_empty() {
        print_usage();
        anyhow::bail!("Clone mode requires at least one repository URL");
    }

    //
    // Check tools
    //

    check_required_tools().await;

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

    info!("All operations completed");

    Ok(())
}

async fn clone_and_scan(
    repo: RepoJob,
    workspace_dir: PathBuf,
    tx: Option<mpsc::Sender<InstallTask>>,
    multi: Arc<MultiProgress>,
) -> Result<()> {
    let repo_name = repo
        .url
        .split('/')
        .last()
        .unwrap()
        .replace(".git", "");

    let repo_path =
        workspace_dir.join(&repo_name);

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

        let status =
            run_command_with_prefix(
                "git",
                &[
                    "clone",
                    &repo.url,
                    &repo_path_str,
                ],
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
        "Scanned {}",
        repo_name
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
            "[{}] {} failed",
            task.repo_name,
            task.platform
                .display_name()
        ));

        return Ok(());
    }

    pb.finish_with_message(format!(
        "[{}] {} installed at {}",
        task.repo_name,
        task.platform.display_name(),
        task.path.display()
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

    let mut child =
        match command.spawn() {
            Ok(child) => child,

            Err(err) if cfg!(windows) => {
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

    Ok(status)
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
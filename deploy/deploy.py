#!/usr/bin/env python3
"""
ListPull Deployment Script for Debian
Installs Docker, configures the application, and starts the container.

Usage:
    sudo python3 deploy.py [--non-interactive]

Options:
    --non-interactive    Use defaults/env vars instead of prompting
"""

import subprocess
import sys
import os
import time
import argparse
import secrets
from pathlib import Path

# Configuration with defaults
CONFIG_FIELDS = [
    # (key, prompt, default, required)
    ("JWT_SECRET", "JWT Secret (min 32 chars)", "", True),
    ("VITE_STORE_NAME", "Store Name", "ListPull", False),
    ("VITE_STORE_EMAIL", "Store Email", "contact@example.com", False),
    ("VITE_STORE_PHONE", "Store Phone (XXX.XXX.XXXX)", "555.123.4567", False),
    ("VITE_STORE_ADDRESS", "Store Address", "123 Main Street", False),
    ("VITE_ORDER_PREFIX", "Order Prefix", "LP", False),
    ("VITE_ORDER_HOLD_DAYS", "Order Hold Days", "7", False),
    ("VITE_MAX_FILE_SIZE_MB", "Max File Size (MB)", "1", False),
    ("VITE_MAX_DECKLIST_CARDS", "Max Decklist Cards", "500", False),
    ("SMTP_HOST", "SMTP Host (optional)", "", False),
    ("SMTP_PORT", "SMTP Port", "587", False),
    ("SMTP_USER", "SMTP Username (optional)", "", False),
    ("SMTP_PASS", "SMTP Password (optional)", "", False),
    ("FROM_EMAIL", "From Email (optional)", "", False),
]


class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    END = "\033[0m"


def print_banner() -> None:
    print(f"""
{Colors.CYAN}{Colors.BOLD}
 ╦  ╦╔═╗╔╦╗╔═╗╦ ╦╦  ╦
 ║  ║╚═╗ ║ ╠═╝║ ║║  ║
 ╩═╝╩╚═╝ ╩ ╩  ╚═╝╩═╝╩═╝
{Colors.END}{Colors.BOLD}
   Self-Hosted Deployment Script
{Colors.END}""")


def print_step(msg: str) -> None:
    print(f"\n{Colors.BLUE}{Colors.BOLD}==>{Colors.END} {msg}")


def print_success(msg: str) -> None:
    print(f"{Colors.GREEN}✓{Colors.END} {msg}")


def print_warning(msg: str) -> None:
    print(f"{Colors.YELLOW}⚠{Colors.END} {msg}")


def print_error(msg: str) -> None:
    print(f"{Colors.RED}✗{Colors.END} {msg}")


def run_command(
    cmd: list[str],
    check: bool = True,
    capture: bool = False,
    env: dict = None
) -> subprocess.CompletedProcess:
    """Run a shell command and handle errors."""
    try:
        full_env = os.environ.copy()
        if env:
            full_env.update(env)
        result = subprocess.run(
            cmd,
            check=check,
            capture_output=capture,
            text=True,
            env=full_env
        )
        return result
    except subprocess.CalledProcessError as e:
        print_error(f"Command failed: {' '.join(cmd)}")
        if e.stderr:
            print(e.stderr)
        if check:
            sys.exit(1)
        return e


def check_root() -> None:
    """Ensure script is run as root."""
    if os.geteuid() != 0:
        print_error("This script must be run as root (use sudo)")
        sys.exit(1)


def check_debian() -> None:
    """Verify we're running on Debian."""
    if not Path("/etc/debian_version").exists():
        print_warning("This script is designed for Debian. Proceeding anyway...")


def is_docker_installed() -> bool:
    """Check if Docker is already installed."""
    result = run_command(["which", "docker"], check=False, capture=True)
    return result.returncode == 0


def get_compose_command() -> list[str]:
    """Get the appropriate docker compose command."""
    result = run_command(["docker", "compose", "version"], check=False, capture=True)
    if result.returncode == 0:
        return ["docker", "compose"]
    result = run_command(["which", "docker-compose"], check=False, capture=True)
    if result.returncode == 0:
        return ["docker-compose"]
    return None


def install_docker() -> None:
    """Install Docker on Debian."""
    print_step("Installing Docker...")

    # Update package index
    print("  Updating package index...")
    run_command(["apt-get", "update", "-qq"])

    # Install prerequisites
    print("  Installing prerequisites...")
    run_command([
        "apt-get", "install", "-y", "-qq",
        "ca-certificates", "curl", "gnupg", "lsb-release"
    ])

    # Add Docker's official GPG key
    print("  Adding Docker GPG key...")
    Path("/etc/apt/keyrings").mkdir(parents=True, exist_ok=True)

    curl_proc = subprocess.Popen(
        ["curl", "-fsSL", "https://download.docker.com/linux/debian/gpg"],
        stdout=subprocess.PIPE
    )
    subprocess.run(
        ["gpg", "--dearmor", "-o", "/etc/apt/keyrings/docker.gpg"],
        stdin=curl_proc.stdout,
        check=True
    )
    curl_proc.wait()

    os.chmod("/etc/apt/keyrings/docker.gpg", 0o644)

    # Add Docker repository
    print("  Adding Docker repository...")
    result = run_command(["lsb_release", "-cs"], capture=True)
    codename = result.stdout.strip()

    # Handle Debian version mapping
    debian_codenames = {
        "trixie": "bookworm",
        "sid": "bookworm",
    }
    codename = debian_codenames.get(codename, codename)

    repo_line = (
        f"deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] "
        f"https://download.docker.com/linux/debian {codename} stable"
    )
    Path("/etc/apt/sources.list.d/docker.list").write_text(repo_line + "\n")

    # Install Docker
    print("  Installing Docker packages...")
    run_command(["apt-get", "update", "-qq"])
    run_command([
        "apt-get", "install", "-y", "-qq",
        "docker-ce", "docker-ce-cli", "containerd.io", "docker-compose-plugin"
    ])

    # Start and enable Docker
    run_command(["systemctl", "start", "docker"])
    run_command(["systemctl", "enable", "docker"])

    print_success("Docker installed successfully")


def get_script_directory() -> Path:
    """Get the project root directory."""
    script_path = Path(__file__).resolve()
    return script_path.parent.parent


def generate_jwt_secret() -> str:
    """Generate a secure random JWT secret."""
    return secrets.token_hex(32)


def prompt_config(non_interactive: bool) -> dict[str, str]:
    """Prompt user for configuration or use defaults."""
    config = {}

    if non_interactive:
        print_step("Using default/environment configuration...")
        for key, _, default, required in CONFIG_FIELDS:
            value = os.environ.get(key, default)
            # Auto-generate JWT secret if not provided
            if key == "JWT_SECRET" and not value:
                value = generate_jwt_secret()
                print(f"  Generated JWT_SECRET: {value[:8]}...")
            if required and not value:
                print_error(f"{key} is required. Set it via environment variable.")
                sys.exit(1)
            config[key] = value
        return config

    print_step("Configuration")
    print("Press Enter to accept defaults shown in brackets.\n")

    for key, prompt, default, required in CONFIG_FIELDS:
        # Special handling for JWT_SECRET
        if key == "JWT_SECRET":
            generated = generate_jwt_secret()
            print(f"  {prompt}")
            print(f"  [Generated: {generated[:8]}...] (press Enter to use, or type your own)")
            value = input("  > ").strip()
            if not value:
                value = generated
            elif len(value) < 32:
                print_warning("JWT secret should be at least 32 characters. Using generated value.")
                value = generated
            config[key] = value
            continue

        if required:
            suffix = " [required]: "
        elif default:
            suffix = f" [{default}]: "
        else:
            suffix = ": "

        value = input(f"  {prompt}{suffix}").strip()

        if not value and required:
            print_error(f"{prompt} is required")
            sys.exit(1)

        config[key] = value if value else default

    return config


def write_env_file(project_dir: Path, config: dict[str, str]) -> None:
    """Write the listpull.env file with configuration."""
    env_path = project_dir / "listpull.env"

    lines = [
        "# ListPull Configuration",
        "# Generated by deploy.py",
        "# Rebuild container after changes: docker compose --env-file listpull.env up -d --build",
        "",
    ]

    for key, value in config.items():
        if " " in value or "(" in value:
            lines.append(f'{key}="{value}"')
        else:
            lines.append(f"{key}={value}")

    env_path.write_text("\n".join(lines) + "\n")
    print_success(f"Configuration written to {env_path}")


def build_and_start(project_dir: Path, config: dict[str, str]) -> None:
    """Build and start the Docker containers."""
    print_step("Building and starting containers...")

    os.chdir(project_dir)

    compose_cmd = get_compose_command()
    if not compose_cmd:
        print_error("Docker Compose not found")
        sys.exit(1)

    # Build with environment variables
    print("  Building Docker image (this may take a few minutes)...")
    run_command(compose_cmd + ["build", "--no-cache"], env=config)

    # Start
    print("  Starting containers...")
    run_command(compose_cmd + ["up", "-d"], env=config)

    print_success("Containers started")


def wait_for_healthy(timeout: int = 90) -> bool:
    """Wait for the application to become healthy."""
    print_step(f"Waiting for application to start (timeout: {timeout}s)...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            result = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                 "http://localhost:3000/api/health"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.stdout.strip() == "200":
                print()
                return True
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            pass
        time.sleep(2)
        print(".", end="", flush=True)

    print()
    return False


def get_server_ip() -> str:
    """Get the server's IP address."""
    try:
        result = run_command(["hostname", "-I"], capture=True)
        ips = result.stdout.strip().split()
        return ips[0] if ips else "localhost"
    except Exception:
        return "localhost"


def print_summary(project_dir: Path, config: dict[str, str]) -> None:
    """Print deployment summary and next steps."""
    ip = get_server_ip()
    store_name = config.get("VITE_STORE_NAME", "ListPull")

    print(f"""
{Colors.GREEN}{Colors.BOLD}
╔═══════════════════════════════════════════════════════════════╗
║            {store_name:^43}            ║
║                  Deployed Successfully!                       ║
╚═══════════════════════════════════════════════════════════════╝
{Colors.END}

{Colors.BOLD}Application URL:{Colors.END}
    http://{ip}:3000

{Colors.BOLD}Default Admin Login:{Colors.END}
    Email: admin@store.com
    Password: changeme123

    IMPORTANT: Change the password after first login!

    To change the admin password or add users, you can:
    - Use the admin panel (coming soon)
    - Or run: cd {project_dir}/server && npm run seed

{Colors.BOLD}Useful Commands:{Colors.END}
    cd {project_dir}
    docker compose logs -f          # View logs
    docker compose restart          # Restart
    docker compose down             # Stop
    docker compose up -d --build    # Rebuild after config changes

{Colors.BOLD}Configuration File:{Colors.END}
    {project_dir}/listpull.env
    (Rebuild required after changes)

{Colors.BOLD}Database Location:{Colors.END}
    Docker volume: listpull-data
    Inside container: /app/data/listpull.db

{Colors.BOLD}Production Setup (recommended):{Colors.END}
    1. Point a domain to {ip}
    2. Install nginx: apt install nginx
    3. Copy deploy/nginx.conf to /etc/nginx/sites-available/
    4. Set up SSL: apt install certbot python3-certbot-nginx
                   certbot --nginx -d yourdomain.com
""")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy ListPull on Debian")
    parser.add_argument(
        "--non-interactive", "-y",
        action="store_true",
        help="Use defaults/environment variables instead of prompting"
    )
    args = parser.parse_args()

    print_banner()

    # Preflight checks
    check_root()
    check_debian()

    project_dir = get_script_directory()
    print(f"Project directory: {project_dir}")

    # Check for required files
    required_files = ["Dockerfile", "docker-compose.yml", "package.json"]
    for f in required_files:
        if not (project_dir / f).exists():
            print_error(f"Required file not found: {f}")
            print_error("Make sure you're running from the correct directory")
            sys.exit(1)

    # Install Docker if needed
    if is_docker_installed():
        print_success("Docker is already installed")
    else:
        install_docker()

    if not get_compose_command():
        print_error("Docker Compose not available")
        sys.exit(1)

    # Configure
    config = prompt_config(args.non_interactive)
    write_env_file(project_dir, config)

    # Build and start
    build_and_start(project_dir, config)

    # Health check
    if wait_for_healthy():
        print_success("Application is running and healthy")
    else:
        print_warning("Application may still be starting.")
        print_warning("Check logs with: docker compose logs -f")

    # Summary
    print_summary(project_dir, config)


if __name__ == "__main__":
    main()

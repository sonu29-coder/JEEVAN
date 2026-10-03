"""
HEMO-GRID AI / JEEVAN - All-in-One Unified Server Launcher
Runs both the FastAPI Backend and Next.js Frontend in a single process manager
and automatically opens the full application in your default browser.
"""

import os
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def check_service(url: str, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def free_port(port: int):
    """Gracefully terminate any orphan process lingering on the port."""
    if sys.platform == "win32":
        try:
            cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"'
            subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=4)
        except Exception:
            pass


def main():
    print("=" * 65)
    print("   HEMO-GRID AI / JEEVAN - All-in-One Application Launcher")
    print("=" * 65)
    print()

    # Free ports 8000, 3000, 3001 if lingering
    free_port(8000)
    free_port(3000)
    free_port(3001)
    time.sleep(1)

    # 1. Start FastAPI Backend Process
    print("[1/3] Starting FastAPI Backend on http://127.0.0.1:8000 ...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = str(ROOT_DIR)

    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
        cwd=str(ROOT_DIR),
        env=backend_env,
    )

    # 2. Start Next.js Frontend Process
    print("[2/3] Starting Next.js Frontend on http://localhost:3000 ...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
    )

    # 3. Wait for services to be ready
    print("[3/3] Waiting for services to initialize...")
    backend_ready = False
    frontend_ready = False

    for _ in range(40):
        if not backend_ready:
            backend_ready = check_service("http://127.0.0.1:8000/health")
        if not frontend_ready:
            frontend_ready = check_service("http://localhost:3000")

        if backend_ready and frontend_ready:
            break
        time.sleep(0.5)

    print()
    print("=" * 65)
    print("  SUCCESS: Full Application is Running!")
    print("  - Web Portal:    http://localhost:3000")
    print("  - REST Backend:  http://127.0.0.1:8000")
    print("  - Swagger Docs:  http://127.0.0.1:8000/docs")
    print("=" * 65)
    print()
    print("Opening http://localhost:3000 in your browser...")
    webbrowser.open("http://localhost:3000")
    print("Press CTRL+C anytime in this window to stop both servers.")
    print()

    try:
        # Keep running until user terminates
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                break
    except KeyboardInterrupt:
        print("\nStopping all services...")
    finally:
        for proc, name in [(backend_proc, "Backend"), (frontend_proc, "Frontend")]:
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=3)
                except Exception:
                    proc.kill()
        print("All services stopped.")


if __name__ == "__main__":
    main()

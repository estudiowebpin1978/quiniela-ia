"""
Shared config for Python scripts. Reads from .env.local (same as Next.js).
"""
import os

def load_env():
    """Load .env.local from project root."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".env.local")
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip().strip('"').strip("'")
                value = value.strip().strip('"').strip("'")
                if key and value:
                    os.environ.setdefault(key, value)

load_env()

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

"""
Configuration for ML Backend. Reads from environment variables or .env file.
"""
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_API_PORT = int(os.environ.get("ML_API_PORT", "8000"))
ML_API_HOST = os.environ.get("ML_API_HOST", "0.0.0.0")

TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

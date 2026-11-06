import os
import json
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "config.json"

DEFAULT_CONFIG = {
    "gemini_api_key": os.environ.get("GEMINI_API_KEY", ""),
    "webhook_url": "https://script.google.com/macros/s/SEU_SCRIPT_ID/exec",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/SEU_SPREADSHEET_ID/edit",
    "model_name": "gemini-2.5-flash",
    "port": 8000
}

def load_config() -> dict:
    config = DEFAULT_CONFIG.copy()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                config.update(saved)
        except Exception as e:
            print(f"[Aviso] Falha ao ler {CONFIG_FILE}: {e}")
    
    # Prioritize environment variables if set
    if os.environ.get("GEMINI_API_KEY"):
        config["gemini_api_key"] = os.environ.get("GEMINI_API_KEY")
    return config

def save_config(new_config: dict) -> dict:
    current = load_config()
    current.update(new_config)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Erro] Falha ao salvar config: {e}")
    return current

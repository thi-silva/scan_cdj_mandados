import os
import sys
import webbrowser
import threading
import time
import uvicorn
from config import load_config

def open_browser(port):
    time.sleep(1.2)
    url = f"http://localhost:{port}"
    print(f"\n=======================================================")
    print(f"🚀 ScanJudicial iniciado com sucesso!")
    print(f"👉 Interface Web: {url}")
    print(f"=======================================================\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[Aviso] Não foi possível abrir o navegador automaticamente: {e}")

if __name__ == "__main__":
    cfg = load_config()
    port = int(cfg.get("port", 8000))
    
    # Inicia thread para abrir navegador automaticamente
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

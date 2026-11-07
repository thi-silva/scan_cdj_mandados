import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).parent / "historico.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            numero_processo TEXT,
            processo_sei TEXT,
            data_recebimento TEXT,
            hora_recebimento TEXT,
            responsavel TEXT,
            demandante TEXT,
            demandado TEXT,
            tipo_documento TEXT,
            vara_comarca TEXT,
            status_envio TEXT DEFAULT 'pendente',
            mensagem_retorno TEXT,
            imagem_preview TEXT
        )
    """)
    # Garante que a coluna processo_sei exista em bancos já criados anteriormente
    try:
        cursor.execute("ALTER TABLE scans ADD COLUMN processo_sei TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()

def save_scan(data: Dict[str, Any]) -> int:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO scans (
            timestamp, numero_processo, processo_sei, data_recebimento, hora_recebimento,
            responsavel, demandante, demandado, tipo_documento, vara_comarca,
            status_envio, mensagem_retorno, imagem_preview
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        data.get("numero_processo", ""),
        data.get("processo_sei", ""),
        data.get("data_recebimento", ""),
        data.get("hora_recebimento", ""),
        data.get("responsavel", ""),
        data.get("demandante", ""),
        data.get("demandado", ""),
        data.get("tipo_documento", ""),
        data.get("vara_comarca", ""),
        data.get("status_envio", "pendente"),
        data.get("mensagem_retorno", ""),
        data.get("imagem_preview", "")
    ))
    scan_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return scan_id

def update_scan_status(scan_id: int, status: str, mensagem: str = ""):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE scans SET status_envio = ?, mensagem_retorno = ? WHERE id = ?
    """, (status, mensagem, scan_id))
    conn.commit()
    conn.close()

def get_history(limit: int = 50) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Inicializa tabela
init_db()

import os
import io
import json
import base64
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import load_config, save_config
from database import save_scan, update_scan_status, get_history
from extractor import extract_with_gemini, prepare_image
from google_sheets import send_to_google_sheets, test_webhook_connection

app = FastAPI(title="ScanJudicial - Leitor de Mandados com IA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class AnalyzeBase64Request(BaseModel):
    image: str # data:image/jpeg;base64,...

class SendToSheetRequest(BaseModel):
    scan_id: Optional[int] = None
    dados: Dict[str, Any]

class ConfigUpdateRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    webhook_url: Optional[str] = None
    spreadsheet_url: Optional[str] = None
    model_name: Optional[str] = None

@app.get("/", response_class=HTMLResponse)
def index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>ScanJudicial em inicialização... Recarregue em alguns segundos.</h1>")
    return FileResponse(index_file)

@app.get("/api/config")
def get_current_config():
    cfg = load_config()
    key = cfg.get("gemini_api_key", "")
    masked_key = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else ("Configurada" if key else "")
    return {
        "has_gemini_key": bool(key),
        "masked_gemini_key": masked_key,
        "webhook_url": cfg.get("webhook_url", ""),
        "spreadsheet_url": cfg.get("spreadsheet_url", ""),
        "model_name": cfg.get("model_name", "gemini-2.5-flash")
    }

@app.post("/api/config")
def update_configuration(req: ConfigUpdateRequest):
    updates = {}
    if req.gemini_api_key is not None and req.gemini_api_key.strip():
        updates["gemini_api_key"] = req.gemini_api_key.strip()
    if req.webhook_url is not None:
        updates["webhook_url"] = req.webhook_url.strip()
    if req.spreadsheet_url is not None:
        updates["spreadsheet_url"] = req.spreadsheet_url.strip()
    if req.model_name is not None:
        updates["model_name"] = req.model_name.strip()
    
    saved = save_config(updates)
    return {"success": True, "message": "Configurações salvas com sucesso!"}

@app.post("/api/analyze")
def analyze_image_base64(req: AnalyzeBase64Request):
    cfg = load_config()
    api_key = cfg.get("gemini_api_key", "")
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Chave de API do Google Gemini não configurada. Por favor, acesse o botão de Configurações no canto superior e insira sua chave gratuita do Google AI Studio."
        )

    try:
        jpeg_bytes = prepare_image(req.image)
        extracted = extract_with_gemini(jpeg_bytes, api_key, cfg.get("model_name", "gemini-2.5-flash"))
        
        # Cria thumbnail miniatura para histórico (max 200px)
        preview_base64 = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes[:100000]).decode("utf-8")
        
        # Salva no banco de dados local
        scan_id = save_scan({
            "numero_processo": extracted.get("numero_processo", ""),
            "data_recebimento": extracted.get("data_recebimento", ""),
            "hora_recebimento": extracted.get("hora_recebimento", ""),
            "responsavel": extracted.get("responsavel", ""),
            "demandante": extracted.get("demandante", ""),
            "demandado": extracted.get("demandado", ""),
            "tipo_documento": extracted.get("tipo_documento", ""),
            "vara_comarca": extracted.get("vara_comarca", ""),
            "status_envio": "aguardando_confirmacao",
            "mensagem_retorno": "IA concluiu a leitura com sucesso",
            "imagem_preview": ""
        })

        return {
            "success": True,
            "scan_id": scan_id,
            "data": extracted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_and_analyze(file: UploadFile = File(...)):
    cfg = load_config()
    api_key = cfg.get("gemini_api_key", "")
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Chave de API do Google Gemini não configurada. Configure na engrenagem no topo."
        )

    content = await file.read()
    filename = file.filename.lower()

    jpeg_bytes = None
    if filename.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        if len(reader.pages) > 0 and len(reader.pages[0].images) > 0:
            jpeg_bytes = reader.pages[0].images[0].data
        else:
            raise HTTPException(status_code=400, detail="PDF não contém imagens legíveis para escaneamento.")
    else:
        jpeg_bytes = content

    jpeg_bytes = prepare_image(jpeg_bytes)
    extracted = extract_with_gemini(jpeg_bytes, api_key, cfg.get("model_name", "gemini-2.5-flash"))

    scan_id = save_scan({
        "numero_processo": extracted.get("numero_processo", ""),
        "data_recebimento": extracted.get("data_recebimento", ""),
        "hora_recebimento": extracted.get("hora_recebimento", ""),
        "responsavel": extracted.get("responsavel", ""),
        "demandante": extracted.get("demandante", ""),
        "demandado": extracted.get("demandado", ""),
        "tipo_documento": extracted.get("tipo_documento", ""),
        "vara_comarca": extracted.get("vara_comarca", ""),
        "status_envio": "aguardando_confirmacao",
        "mensagem_retorno": f"Upload realizado: {file.filename}",
        "imagem_preview": ""
    })

    return {
        "success": True,
        "scan_id": scan_id,
        "data": extracted,
        "preview_url": "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode("utf-8")
    }

@app.post("/api/send")
def send_to_sheet_endpoint(req: SendToSheetRequest):
    cfg = load_config()
    webhook_url = cfg.get("webhook_url", "")
    
    result = send_to_google_sheets(webhook_url, req.dados)
    
    if req.scan_id:
        new_status = "enviado" if result.get("success") else "erro"
        update_scan_status(req.scan_id, new_status, result.get("message", ""))

    return result

@app.get("/api/history")
def get_scan_history():
    return {"history": get_history(50)}

@app.post("/api/test-webhook")
def test_webhook_endpoint():
    cfg = load_config()
    webhook_url = cfg.get("webhook_url", "")
    return test_webhook_connection(webhook_url)

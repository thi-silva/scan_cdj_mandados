import os
import json
import base64
import re
from typing import Dict, Any, Optional
from PIL import Image
import io

SYSTEM_INSTRUCTION = """
Você é um especialista em análise de documentos judiciais, carimbos processuais e anotações manuscritas de protocolo (Mandados de Notificação, Citação, Intimação, etc.).
Sua tarefa é analisar a imagem fornecida (capturada por câmera ou scanner) e extrair EXCLUSIVAMENTE 3 informações, seguindo rigorosamente esta ordem:

1. "data_recebimento" (Coluna: DATA): A data em que o mandado foi recebido, identificada especificamente no carimbo de recepção (geralmente com o texto "RECEBIDO EM: DD/MM/AAAA", muitas vezes manuscrito). Retorne no formato DD/MM/AAAA.
2. "numero_processo" (Coluna: JUDICIAL): O número do processo judicial no padrão CNJ (exemplo: "0001234-56.2026.8.00.0001"), geralmente localizado próximo a "Processo nº:". Preserve toda a pontuação e dígitos verificadores.
3. "processo_sei" (Coluna: SEI): O número do processo SEI anotado no papel (geralmente manuscrito na página, PODENDO ESTAR ESCRITO NA VERTICAL nas margens/laterais ou na horizontal). Ele possui números antes da barra e termina obrigatoriamente na estrutura "/XXXX-XX", onde "XXXX" são 4 dígitos referentes ao ano (ex: 2025, 2026) e "XX" são 2 dígitos finais (exemplos: "00610489.001712/2025-06" ou "001712/2025-06"). Leia com extrema atenção inclusive textos inclinados ou escritos na vertical (90 graus).

Retorne APENAS um JSON válido estritamente nesta ordem e com estas 3 chaves:
{
  "data_recebimento": "...",
  "numero_processo": "...",
  "processo_sei": "..."
}
"""

_GENAI_CLIENTS: Dict[str, Any] = {}

def _get_genai_client(api_key: str):
    client = _GENAI_CLIENTS.get(api_key)
    if client is None:
        from google import genai
        client = genai.Client(api_key=api_key)
        _GENAI_CLIENTS[api_key] = client
    return client

def extract_with_gemini(image_bytes: bytes, api_key: str, model_name: str = "gemini-3.1-flash-lite") -> Dict[str, Any]:
    """
    Analisa a imagem utilizando a biblioteca oficial google-genai com baixa latência
    """
    if not api_key:
        raise ValueError("Chave de API do Gemini não configurada. Configure em Configurações.")

    # Lista de modelos ativos e funcionais para chaves novas do Google AI Studio
    active_models = [
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
    ]
    if model_name not in active_models:
        model_name = "gemini-3.1-flash-lite"

    # Monta fila de tentativa começando pelo modelo escolhido seguido dos fallbacks
    candidate_models = [model_name] + [m for m in active_models if m != model_name]

    from google.genai import types

    client = _get_genai_client(api_key)

    prompt = (
        "Extraia em JSON estrito na ordem: "
        "1. data_recebimento (carimbo 'RECEBIDO EM', formato DD/MM/AAAA); "
        "2. numero_processo ('Processo nº:' padrão CNJ); "
        "3. processo_sei (anotado na página, inclusive na vertical, formato .../XXXX-XX)."
    )

    # Garante imagem otimizada (max 1400px) enviada diretamente como JPEG bytes sem re-encodar para PNG
    img_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

    last_error = None
    for candidate in candidate_models:
        try:
            config_kwargs: Dict[str, Any] = {
                "system_instruction": SYSTEM_INSTRUCTION,
                "response_mime_type": "application/json",
                "temperature": 0.1,
            }
            # Desabilita thinking nos modelos Gemini 3/3.1 para resposta quase instantânea
            if candidate.startswith("gemini-3"):
                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

            response = client.models.generate_content(
                model=candidate,
                contents=[img_part, prompt],
                config=types.GenerateContentConfig(**config_kwargs),
            )

            raw_text = response.text.strip()
            # Limpa blocos de código markdown se houver
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\n", "", raw_text)
                raw_text = re.sub(r"\n```$", "", raw_text)

            data = json.loads(raw_text)
            return data

        except Exception as e:
            last_error = e
            print(f"[Aviso] Modelo {candidate} falhou, tentando próximo fallback: {e}")

    raise RuntimeError(f"Erro ao analisar com Gemini: {str(last_error)}")

def prepare_image(image_input) -> bytes:
    """
    Converte base64 data URL, bytes ou PIL Image para JPEG bytes otimizados (rápido para envio e IA)
    """
    if isinstance(image_input, str):
        if "base64," in image_input:
            image_input = image_input.split("base64,")[1]
        raw_bytes = base64.b64decode(image_input)
    elif isinstance(image_input, bytes):
        raw_bytes = image_input
    else:
        raise ValueError("Formato de imagem não suportado")

    # Otimiza e padroniza para JPEG com Pillow
    img = Image.open(io.BytesIO(raw_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    # Redimensiona para até 1400px (nitidez excelente para texto/carimbos e ~4x mais rápido na rede e na IA)
    max_dim = 1400
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    img.save(output, format="JPEG", quality=82, optimize=True)
    return output.getvalue()

import os
import json
import base64
import re
from typing import Dict, Any, Optional
from PIL import Image
import io

SYSTEM_INSTRUCTION = """
Você é um especialista em análise de documentos judiciais e carimbos processuais brasileiros (Mandados de Notificação, Citação, Intimação, etc.).
Sua tarefa é analisar a imagem fornecida (capturada por câmera ou scanner) e extrair EXCLUSIVAMENTE 3 informações, seguindo rigorosamente esta ordem:

1. "data_recebimento" (Coluna: Data de Autuação): A data em que o mandado foi recebido, identificada especificamente no carimbo de recepção (geralmente com o texto "RECEBIDO EM: DD/MM/AAAA", muitas vezes manuscrito). Retorne no formato DD/MM/AAAA.
2. "numero_processo" (Coluna: Processo Judicial): O número do processo judicial no padrão CNJ (exemplo: "0001234-56.2026.8.00.0001"), geralmente localizado próximo a "Processo nº:". Preserve toda a pontuação e dígitos verificadores.
3. "responsavel" (Coluna: Observações): A pessoa que recebe o documento, identificada no carimbo de recepção (nome, matrícula e/ou cargo de quem assinou ou recebeu no carimbo, exemplo: "Nome do Servidor - Mat. 000.000-0").

Retorne APENAS um JSON válido estritamente nesta ordem e com estas 3 chaves:
{
  "data_recebimento": "...",
  "numero_processo": "...",
  "responsavel": "..."
}
"""

def extract_with_gemini(image_bytes: bytes, api_key: str, model_name: str = "gemini-3.1-flash-lite") -> Dict[str, Any]:
    """
    Analisa a imagem utilizando a biblioteca oficial google-genai
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

    from google import genai
    from PIL import Image

    client = genai.Client(api_key=api_key)

    prompt = (
        "Analise atentamente a imagem deste documento judicial e extraia apenas as 3 informações abaixo na seguinte ordem:\n"
        "1. data_recebimento (Data de Autuação): a data manuscrita ou carimbada dentro do carimbo 'RECEBIDO EM' (formato DD/MM/AAAA).\n"
        "2. numero_processo (Processo Judicial): o número do processo judicial no padrão CNJ localizado em 'Processo nº:'.\n"
        "3. responsavel (Observações): o nome/matrícula da pessoa que recebeu o documento conforme consta no carimbo."
    )

    # Converte bytes para PIL Image otimizada para o Gemini
    img = Image.open(io.BytesIO(image_bytes))
    if max(img.size) > 1800:
        img.thumbnail((1800, 1800), Image.Resampling.LANCZOS)

    last_error = None
    for candidate in candidate_models:
        try:
            response = client.models.generate_content(
                model=candidate,
                contents=[img, prompt],
                config={
                    "system_instruction": SYSTEM_INSTRUCTION,
                    "response_mime_type": "application/json",
                    "temperature": 0.1,
                },
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
    Converte base64 data URL, bytes ou PIL Image para JPEG bytes otimizados
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
    
    # Redimensiona se for excessivamente grande (> 2500px) para acelerar transferência mantendo nitidez perfeita
    max_dim = 2500
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    img.save(output, format="JPEG", quality=90)
    return output.getvalue()

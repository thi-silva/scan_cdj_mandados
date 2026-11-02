import os
import json
import base64
import re
from typing import Dict, Any, Optional
from PIL import Image
import io

SYSTEM_INSTRUCTION = """
Você é um especialista em análise de documentos judiciais e carimbos processuais brasileiros (Mandados de Notificação, Citação, Intimação, etc.).
Sua tarefa é analisar a imagem fornecida (capturada por câmera ou scanner) e extrair com extrema precisão os dados essenciais para controle processual:

1. "numero_processo": O número do processo no padrão CNJ (exemplo: "0001234-56.2026.8.00.0001"). Geralmente localizado próximo a "Processo nº:". Preserve pontuação e dígitos verificadores.
2. "data_recebimento": A data em que o mandado foi formalmente recebido, identificada especificamente no carimbo de recepção (geralmente no topo ou rodapé, com o texto "RECEBIDO EM: DD/MM/AAAA", muitas vezes manuscrito). Retorne no formato DD/MM/AAAA.
3. "hora_recebimento": A hora em que foi recebido, se constar no carimbo (exemplo: "14:30" ou "Hora: 14:30").
4. "responsavel": O nome e matrícula/cargo de quem assinou ou recebeu o carimbo (exemplo: "Nome do Servidor - Mat. 000.000-0 - Cargo").
5. "tipo_documento": O título do documento (exemplo: "MANDADO DE NOTIFICAÇÃO", "MANDADO DE CITAÇÃO", "MANDADO DE INTIMAÇÃO").
6. "demandante": A parte autora ou demandante do processo (exemplo: "NOME DA PARTE AUTORA").
7. "demandado": A parte ré ou demandada (exemplo: "ENTE PÚBLICO OU PARTE RÉ").
8. "vara_comarca": Juízo ou vara de origem (exemplo: "Juízo da 1ª Vara da Fazenda Pública").

Retorne APENAS um JSON válido no formato:
{
  "numero_processo": "...",
  "data_recebimento": "...",
  "hora_recebimento": "...",
  "responsavel": "...",
  "tipo_documento": "...",
  "demandante": "...",
  "demandado": "...",
  "vara_comarca": "...",
  "confianca": "alta|media|baixa",
  "observacoes": "..."
}
"""

def extract_with_gemini(image_bytes: bytes, api_key: str, model_name: str = "gemini-3.5-flash-lite") -> Dict[str, Any]:
    """
    Analisa a imagem utilizando a biblioteca oficial google-genai
    """
    if not api_key:
        raise ValueError("Chave de API do Gemini não configurada. Configure em Configurações.")

    from google import genai
    from PIL import Image

    client = genai.Client(api_key=api_key)

    prompt = (
        "Analise atentamente a imagem deste documento judicial. "
        "Localize o campo 'Processo nº:' para obter o número do processo judicial "
        "e examine o carimbo de recepção ('RECEBIDO EM') para extrair com precisão a data de recebimento manuscrita/carimbada, "
        "a hora e o responsável. Extraia também demandante e demandado se visíveis."
    )

    # Converte bytes para PIL Image otimizada para o Gemini
    img = Image.open(io.BytesIO(image_bytes))
    if max(img.size) > 1800:
        img.thumbnail((1800, 1800), Image.Resampling.LANCZOS)

    try:
        response = client.models.generate_content(
            model=model_name,
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
        # Tenta com gemini-3.8-flash caso o modelo falhe
        if model_name != "gemini-3.8-flash":
            print(f"[Aviso] Tentando fallback para gemini-3.8-flash: {e}")
            return extract_with_gemini(image_bytes, api_key, model_name="gemini-3.8-flash")
        raise RuntimeError(f"Erro ao analisar com Gemini: {str(e)}")

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

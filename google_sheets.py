import requests
from typing import Dict, Any

def send_to_google_sheets(webhook_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Envia os dados do processo e do carimbo para a Planilha do Google via Google Apps Script Webhook.
    """
    if not webhook_url or "script.google.com" not in webhook_url:
        return {
            "success": False,
            "message": "URL do Webhook do Google Apps Script não configurada ou inválida. Veja a aba Configurações."
        }

    try:
        # Prepara payload na ordem exata das 3 colunas preenchidas na planilha oficial:
        # Coluna B: DATA (data_recebimento)
        # Coluna C: JUDICIAL (numero_processo)
        # Coluna D: SEI (processo_sei)
        # (As colunas DATA DE INÍCIO DO PROC. JUDICIAL e ÁREA ficam em branco)
        valor_data = payload.get("data") or payload.get("data_recebimento") or payload.get("data_autuacao", "")
        valor_judicial = payload.get("judicial") or payload.get("numero_processo") or payload.get("processo_judicial", "")
        valor_sei = payload.get("sei") or payload.get("processo_sei", "")

        formatted_payload = {
            "nome_aba": payload.get("nome_aba", ""),
            "data": valor_data,
            "judicial": valor_judicial,
            "sei": valor_sei,
            # Mantém chaves compatíveis
            "data_recebimento": valor_data,
            "numero_processo": valor_judicial,
            "processo_sei": valor_sei,
        }

        response = requests.post(
            webhook_url,
            json=formatted_payload,
            headers={"Content-Type": "application/json"},
            timeout=45,
            allow_redirects=True
        )

        # Trata resposta do Google Apps Script
        if response.status_code in (200, 201, 302):
            try:
                res_json = response.json()
                return {
                    "success": True,
                    "message": res_json.get("message", "Registro inserido com sucesso na planilha!"),
                    "details": res_json
                }
            except Exception:
                # Se retornou texto simples ou HTML de sucesso
                return {
                    "success": True,
                    "message": "Dados enviados com sucesso para a planilha do Google!",
                    "details": response.text[:200]
                }
        else:
            return {
                "success": False,
                "message": f"Erro retornado pelo Google Apps Script (HTTP {response.status_code}): {response.text[:250]}"
            }

    except requests.exceptions.Timeout:
        return {
            "success": False,
            "message": "Tempo limite esgotado ao conectar com a Planilha Google. Verifique sua conexão."
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Falha na comunicação com a planilha: {str(e)}"
        }

def send_batch_to_google_sheets(webhook_url: str, rows: list) -> Dict[str, Any]:
    """
    Envia múltiplos registros em uma única chamada ao Google Apps Script.
    """
    if not webhook_url or "script.google.com" not in webhook_url:
        return {
            "success": False,
            "message": "URL do Webhook do Google Apps Script não configurada ou inválida. Veja a aba Configurações."
        }

    if not rows:
        return {"success": False, "message": "Nenhum registro para enviar."}

    formatted_rows = []
    for item in rows:
        formatted_rows.append({
            "data": item.get("data") or item.get("data_recebimento") or item.get("data_autuacao", ""),
            "judicial": item.get("judicial") or item.get("numero_processo") or item.get("processo_judicial", ""),
            "sei": item.get("sei") or item.get("processo_sei", ""),
        })

    try:
        response = requests.post(
            webhook_url,
            json={"nome_aba": "", "rows": formatted_rows},
            headers={"Content-Type": "application/json"},
            timeout=45,
            allow_redirects=True
        )

        if response.status_code in (200, 201, 302):
            try:
                res_json = response.json()
                return {
                    "success": bool(res_json.get("success", True)),
                    "message": res_json.get("message", f"{len(formatted_rows)} registro(s) inserido(s) com sucesso!"),
                    "details": res_json
                }
            except Exception:
                return {
                    "success": True,
                    "message": f"{len(formatted_rows)} registro(s) enviado(s) com sucesso!",
                    "details": response.text[:200]
                }
        return {
            "success": False,
            "message": f"Erro retornado pelo Google Apps Script (HTTP {response.status_code}): {response.text[:250]}"
        }
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "message": "Tempo limite esgotado ao conectar com a Planilha Google. Verifique sua conexão."
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Falha na comunicação com a planilha: {str(e)}"
        }

def test_webhook_connection(webhook_url: str) -> Dict[str, Any]:
    """
    Testa se a URL do Webhook do Google Apps Script está acessível e respondendo
    """
    if not webhook_url or "script.google.com" not in webhook_url:
        return {"success": False, "message": "URL inválida. Deve começar com https://script.google.com/..."}
    
    test_payload = {
        "nome_aba": "",
        "data": "01/01/2026",
        "judicial": "0000000-00.0000.0.00.0000",
        "sei": "00000000.000000/2026-00",
        "data_recebimento": "01/01/2026",
        "numero_processo": "0000000-00.0000.0.00.0000",
        "processo_sei": "00000000.000000/2026-00",
        "is_test": True
    }
    return send_to_google_sheets(webhook_url, test_payload)

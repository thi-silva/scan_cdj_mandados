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
        # Prepara payload na ordem exata das colunas:
        # 1. Data de Autuação (data_recebimento)
        # 2. Processo Judicial (numero_processo)
        # 3. Observações (responsavel)
        data_autuacao = payload.get("data_autuacao") or payload.get("data_recebimento", "")
        processo_judicial = payload.get("processo_judicial") or payload.get("numero_processo", "")
        observacoes = payload.get("observacoes") or payload.get("responsavel", "")

        formatted_payload = {
            "nome_aba": payload.get("nome_aba", "test_scan_cdj"),
            "data_autuacao": data_autuacao,
            "processo_judicial": processo_judicial,
            "observacoes": observacoes,
            # Mantém chaves compatíveis para scripts legados
            "data_recebimento": data_autuacao,
            "numero_processo": processo_judicial,
            "responsavel": observacoes,
        }

        response = requests.post(
            webhook_url,
            json=formatted_payload,
            headers={"Content-Type": "application/json"},
            timeout=20,
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

def test_webhook_connection(webhook_url: str) -> Dict[str, Any]:
    """
    Testa se a URL do Webhook do Google Apps Script está acessível e respondendo
    """
    if not webhook_url or "script.google.com" not in webhook_url:
        return {"success": False, "message": "URL inválida. Deve começar com https://script.google.com/..."}
    
    test_payload = {
        "nome_aba": "test_scan_cdj",
        "data_autuacao": "01/01/2026",
        "processo_judicial": "0000000-00.0000.0.00.0000",
        "observacoes": "Teste de Conexão Automático",
        "data_recebimento": "01/01/2026",
        "numero_processo": "0000000-00.0000.0.00.0000",
        "responsavel": "Teste de Conexão Automático",
        "is_test": True
    }
    return send_to_google_sheets(webhook_url, test_payload)

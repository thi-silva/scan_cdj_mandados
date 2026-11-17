/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT: INTEGRAÇÃO SCAN JUDICIAL -> PLANILHA DE CONTROLE
 * =========================================================================================
 * 
 * INSTRUÇÕES RÁPIDAS DE INSTALAÇÃO:
 * 1. Abra sua planilha do Google (onde deseja receber os dados):
 *    https://docs.google.com/spreadsheets/d/SEU_SPREADSHEET_ID/edit
 * 2. No menu superior da planilha, clique em: Extensões > Apps Script
 * 3. Apague qualquer código existente no editor e cole TODO este conteúdo.
 * 4. Clique no ícone de "Salvar" (disquete) ou pressione Ctrl + S.
 * 5. No canto superior direito da página do Apps Script, clique no botão azul "Implantar" (Deploy) 
 *    e selecione "Nova implantação" (New deployment).
 * 6. Na janela que abrir:
 *    - Clique no ícone de engrenagem ao lado de "Selecione o tipo" e escolha "Aplicativo da Web" (Web app).
 *    - Descrição: "Receptor de Mandados ScanJudicial"
 *    - Executar como: "Eu (seu email)"
 *    - Quem tem acesso: "Qualquer pessoa" (IMPORTANTE: selecione 'Qualquer pessoa' / 'Anyone' para permitir que a automação envie os dados).
 * 7. Clique em "Implantar" e conceda as permissões solicitadas pelo Google (Avançado > Acessar...).
 * 8. Copie a "URL do aplicativo da Web" gerada (termina com /exec) e cole no painel de configurações do ScanJudicial!
 * =========================================================================================
 */

// Deixe vazio ("") para gravar automaticamente na primeira aba da planilha oficial,
// ou informe o nome exato da aba caso deseje fixar uma aba específica.
var NOME_DA_ABA = "";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Webhook do ScanJudicial está ativo e conectado à Planilha Oficial!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Aguarda até 30 segundos para evitar conflito se houver envios simultâneos
  lock.tryLock(30000);

  try {
    var rawContents = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(rawContents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetSheetName = data.nome_aba || NOME_DA_ABA;
    var sheet = targetSheetName ? ss.getSheetByName(targetSheetName) : null;

    // Se não foi especificado nome de aba (ou se não existir), usa a primeira aba da planilha oficial
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    // Se a planilha estiver completamente vazia, cria o cabeçalho padrão de 5 colunas
    if (sheet.getLastRow() === 0) {
      var cabecalho = [
        "DATA DE INÍCIO DO PROC. JUDICIAL",
        "DATA",
        "JUDICIAL",
        "SEI",
        "ÁREA"
      ];
      sheet.appendRow(cabecalho);
    }

    // Localiza a próxima linha livre olhando no máximo as últimas 200 linhas das colunas B (DATA), C (JUDICIAL) e D (SEI)
    var lastRow = sheet.getLastRow();
    var targetRow = lastRow + 1;
    if (lastRow > 1) {
      var startRow = Math.max(1, lastRow - 199);
      var numRows = lastRow - startRow + 1;
      var valuesBCD = sheet.getRange(startRow, 2, numRows, 3).getValues();
      var found = false;
      for (var i = valuesBCD.length - 1; i >= 0; i--) {
        if (valuesBCD[i][0] !== "" || valuesBCD[i][1] !== "" || valuesBCD[i][2] !== "") {
          targetRow = startRow + i + 1;
          found = true;
          break;
        }
      }
      if (!found && startRow > 1) {
        targetRow = startRow;
      }
    }

    // Suporta envio em lote (data.rows) ou envio unitário
    var rowsInput = Array.isArray(data.rows) && data.rows.length > 0 ? data.rows : [data];
    var rowsToWrite = rowsInput.map(function(item) {
      return [
        item.data || item.data_recebimento || item.data_autuacao || "",
        item.judicial || item.numero_processo || item.processo_judicial || "",
        item.sei || item.processo_sei || ""
      ];
    });

    // Estrutura das 5 colunas da planilha oficial:
    // Coluna A (1): DATA DE INÍCIO DO PROC. JUDICIAL -> não preenchido no momento
    // Coluna B (2): DATA -> Data do recebimento no carimbo
    // Coluna C (3): JUDICIAL -> Número do processo judicial
    // Coluna D (4): SEI -> Número do processo SEI
    // Coluna E (5): ÁREA -> não preenchido no momento
    sheet.getRange(targetRow, 3, rowsToWrite.length, 2).setNumberFormat("@");
    sheet.getRange(targetRow, 2, rowsToWrite.length, 3).setValues(rowsToWrite);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: rowsToWrite.length > 1
        ? rowsToWrite.length + " registros gravados com sucesso nas colunas DATA, JUDICIAL e SEI!"
        : "Registro gravado com sucesso nas colunas DATA, JUDICIAL e SEI!",
      linha_inserida: targetRow,
      total_gravado: rowsToWrite.length,
      aba: sheet.getName(),
      data: rowsToWrite[0][0],
      judicial: rowsToWrite[0][1],
      sei: rowsToWrite[0][2]
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Erro ao gravar na planilha: " + erro.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

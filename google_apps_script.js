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

// Nome da aba de destino específica na sua planilha
var NOME_DA_ABA = "test_scan_cdj"; 

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Webhook do ScanJudicial está ativo e gravando na aba " + NOME_DA_ABA + "!",
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
    var targetSheetName = data.nome_aba || NOME_DA_ABA || "test_scan_cdj";
    var sheet = ss.getSheetByName(targetSheetName);

    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }

    // Se a planilha estiver vazia, cria o cabeçalho automaticamente com formatação visual
    if (sheet.getLastRow() === 0) {
      var cabecalho = [
        "Data/Hora Registro",
        "Número do Processo",
        "Data de Recebimento",
        "Hora Recebimento",
        "Responsável / Matrícula",
        "Demandante (Autor)",
        "Demandado (Réu)",
        "Tipo de Documento",
        "Vara / Comarca"
      ];
      sheet.appendRow(cabecalho);
      var headerRange = sheet.getRange(1, 1, 1, cabecalho.length);
      headerRange.setBackground("#1a365d"); // Azul marinho
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    var agora = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    var novaLinha = [
      agora,
      data.numero_processo || "-",
      data.data_recebimento || "-",
      data.hora_recebimento || "-",
      data.responsavel || "-",
      data.demandante || "-",
      data.demandado || "-",
      data.tipo_documento || "-",
      data.vara_comarca || "-"
    ];

    sheet.appendRow(novaLinha);
    var insertedRow = sheet.getLastRow();

    // Formata o número do processo como texto para preservar pontuação e zeros à esquerda
    sheet.getRange(insertedRow, 2).setNumberFormat("@");

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Registro gravado com sucesso na planilha!",
      linha_inserida: insertedRow,
      numero_processo: data.numero_processo,
      data_recebimento: data.data_recebimento
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

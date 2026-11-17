const MAX_BATCH_SIZE = 5;

// ESTADO GLOBAL DA APLICAÇÃO
const state = {
  currentStream: null,
  activeDeviceId: null,
  videoDevices: [],
  lastScanId: null,
  currentExtractedData: null,
  isScanning: false,
  batchQueue: [],
  selectedIndex: -1,
  config: {
    has_gemini_key: false,
    webhook_url: '',
    spreadsheet_url: '',
    model_name: 'gemini-3.1-flash-lite'
  }
};

// CÓDIGO DO APPS SCRIPT PARA O TUTORIAL
const APPS_SCRIPT_SOURCE = `// Deixe vazio ("") para usar automaticamente a primeira aba da planilha oficial
var NOME_DA_ABA = "";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Webhook do ScanJudicial está ativo e conectado à Planilha Oficial!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    var rawContents = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(rawContents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetSheetName = data.nome_aba || NOME_DA_ABA;
    var sheet = targetSheetName ? ss.getSheetByName(targetSheetName) : null;

    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "DATA DE INÍCIO DO PROC. JUDICIAL",
        "DATA",
        "JUDICIAL",
        "SEI",
        "ÁREA"
      ]);
    }

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

    var rowsInput = Array.isArray(data.rows) && data.rows.length > 0 ? data.rows : [data];
    var rowsToWrite = rowsInput.map(function(item) {
      return [
        item.data || item.data_recebimento || "",
        item.judicial || item.numero_processo || "",
        item.sei || item.processo_sei || ""
      ];
    });

    // Preenche apenas as colunas DATA (B), JUDICIAL (C) e SEI (D)
    sheet.getRange(targetRow, 3, rowsToWrite.length, 2).setNumberFormat("@");
    sheet.getRange(targetRow, 2, rowsToWrite.length, 3).setValues(rowsToWrite);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: rowsToWrite.length > 1
        ? rowsToWrite.length + " registros gravados com sucesso nas colunas DATA, JUDICIAL e SEI!"
        : "Registro gravado com sucesso nas colunas DATA, JUDICIAL e SEI!",
      linha_inserida: targetRow
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Erro: " + erro.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

// ELEMENTOS DOM
const DOM = {
  video: document.getElementById('cameraVideo'),
  canvas: document.getElementById('captureCanvas'),
  cameraSelect: document.getElementById('cameraSelect'),
  cameraStatus: document.getElementById('cameraStatus'),
  laserLine: document.getElementById('laserLine'),
  btnCapture: document.getElementById('btnCapture'),
  btnCaptureText: document.getElementById('btnCaptureText'),
  btnSwitchCamera: document.getElementById('btnSwitchCamera'),
  btnMobileCamera: document.getElementById('btnMobileCamera'),
  mobileCameraInput: document.getElementById('mobileCameraInput'),
  fileInput: document.getElementById('fileInput'),
  dropzone: document.getElementById('dropzone'),

  // Lote (até 5 documentos)
  batchCountBadge: document.getElementById('batchCountBadge'),
  batchThumbsGrid: document.getElementById('batchThumbsGrid'),
  btnExtractBatch: document.getElementById('btnExtractBatch'),
  btnExtractBatchText: document.getElementById('btnExtractBatchText'),
  btnClearBatch: document.getElementById('btnClearBatch'),
  batchNavBar: document.getElementById('batchNavBar'),
  btnPrevDoc: document.getElementById('btnPrevDoc'),
  btnNextDoc: document.getElementById('btnNextDoc'),
  batchNavLabel: document.getElementById('batchNavLabel'),
  btnSendAllSheet: document.getElementById('btnSendAllSheet'),
  btnSendAllText: document.getElementById('btnSendAllText'),
  
  // Painel de Revisão (Ordem: 1. DATA, 2. JUDICIAL, 3. SEI)
  previewContainer: document.getElementById('previewContainer'),
  thumbPlaceholder: document.getElementById('thumbPlaceholder'),
  capturedImagePreview: document.getElementById('capturedImagePreview'),
  extractBadge: document.getElementById('extractBadge'),
  fieldDataRecebimento: document.getElementById('fieldDataRecebimento'),
  fieldProcesso: document.getElementById('fieldProcesso'),
  fieldProcessoSei: document.getElementById('fieldProcessoSei'),
  btnCopyProcesso: document.getElementById('btnCopyProcesso'),
  btnSendSheet: document.getElementById('btnSendSheet'),
  btnSendText: document.getElementById('btnSendText'),
  btnClearForm: document.getElementById('btnClearForm'),

  // Histórico
  historyTableBody: document.getElementById('historyTableBody'),
  btnRefreshHistory: document.getElementById('btnRefreshHistory'),

  // Badges Navbar
  dotGemini: document.getElementById('dotGemini'),
  textGemini: document.getElementById('textGemini'),
  dotSheet: document.getElementById('dotSheet'),
  textSheet: document.getElementById('textSheet'),
  btnOpenSpreadsheet: document.getElementById('btnOpenSpreadsheet'),

  // Modal Configurações
  settingsModal: document.getElementById('settingsModal'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnCancelSettings: document.getElementById('btnCancelSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  cfgGeminiKey: document.getElementById('cfgGeminiKey'),
  cfgWebhookUrl: document.getElementById('cfgWebhookUrl'),
  cfgModelName: document.getElementById('cfgModelName'),
  btnTestWebhook: document.getElementById('btnTestWebhook'),
  scriptCodePreview: document.getElementById('scriptCodePreview'),
  btnCopyScriptCode: document.getElementById('btnCopyScriptCode'),

  // Toasts
  toastContainer: document.getElementById('toastContainer')
};

// TOAST NOTIFICATIONS
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span style="flex:1;">${message}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// INICIALIZAÇÃO DA CÂMERA
async function initCamera(deviceId = null) {
  try {
    if (state.currentStream) {
      state.currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        facingMode: deviceId ? undefined : { ideal: 'environment' }
      },
      audio: false
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      DOM.cameraStatus.textContent = 'Modo Celular (Use o botão "Tirar Foto com Câmera do Celular" abaixo)';
      DOM.cameraSelect.innerHTML = '<option value="">Use o botão 📱 abaixo no celular</option>';
      return;
    }

    DOM.cameraStatus.textContent = 'Conectando câmera...';
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.currentStream = stream;
    DOM.video.srcObject = stream;
    await DOM.video.play();

    DOM.cameraStatus.textContent = 'Câmera Ativa';
    await enumerateCameras();
  } catch (err) {
    console.warn('Erro ao inicializar câmera:', err);
    DOM.cameraStatus.textContent = 'Câmera não disponível ou permissão negada';
    showToast('Não foi possível acessar a câmera. Você pode usar o envio de arquivo JPG/PDF abaixo.', 'info', 6000);
  }
}

// LISTA DISPOSITIVOS DE VÍDEO
async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    state.videoDevices = videoInputs;

    DOM.cameraSelect.innerHTML = '';
    if (videoInputs.length === 0) {
      DOM.cameraSelect.innerHTML = '<option value="">Nenhuma câmera detectada</option>';
      return;
    }

    videoInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Câmera ${index + 1}`;
      DOM.cameraSelect.appendChild(option);
    });

    const activeTrack = state.currentStream?.getVideoTracks()[0];
    if (activeTrack) {
      const currentSettings = activeTrack.getSettings();
      if (currentSettings.deviceId) {
        DOM.cameraSelect.value = currentSettings.deviceId;
        state.activeDeviceId = currentSettings.deviceId;
      }
    }
  } catch (err) {
    console.error('Falha ao listar câmeras:', err);
  }
}

// CAPTURA FRAME DA CÂMERA OTIMIZADO PARA ENVIO RÁPIDO (MAX 1400PX)
function captureFrameAsBase64() {
  const video = DOM.video;
  const canvas = DOM.canvas;
  let width = video.videoWidth || 1280;
  let height = video.videoHeight || 720;

  const maxDim = 1400;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.82);
}

// PARSER SEGURO DE RESPOSTA JSON (EVITA ERRO "the string did not match the expected pattern" NO SAFARI/iOS)
async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) {
    throw new Error(`Resposta vazia do servidor (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`O servidor ou túnel retornou uma resposta inválida (HTTP ${response.status}). Tente novamente.`);
  }
}

// GESTÃO DO LOTE DE ATÉ 5 DOCUMENTOS
function renderBatchQueue() {
  const count = state.batchQueue.length;
  DOM.batchCountBadge.textContent = `${count} / ${MAX_BATCH_SIZE}`;
  DOM.btnCaptureText.textContent = `Adicionar Foto da Câmera (${count}/${MAX_BATCH_SIZE})`;
  DOM.btnCapture.disabled = state.isScanning || count >= MAX_BATCH_SIZE;
  if (DOM.btnMobileCamera) {
    DOM.btnMobileCamera.disabled = state.isScanning || count >= MAX_BATCH_SIZE;
  }

  const pendingCount = state.batchQueue.filter(i => i.status === 'pending' || i.status === 'error').length;
  DOM.btnExtractBatch.disabled = state.isScanning || count === 0 || pendingCount === 0;
  DOM.btnClearBatch.disabled = state.isScanning || count === 0;

  if (!state.isScanning) {
    DOM.btnExtractBatchText.textContent = pendingCount > 0
      ? `✨ Extrair Dados do Lote (${pendingCount})`
      : `✨ Todos Extraídos (${count})`;
  }

  // Atualiza botão "Gravar Todos Extraídos"
  const readyToSendCount = state.batchQueue.filter(i => i.status === 'extracted').length;
  if (count > 1 && readyToSendCount > 0) {
    DOM.btnSendAllSheet.style.display = 'inline-flex';
    DOM.btnSendAllSheet.disabled = state.isScanning;
    DOM.btnSendAllText.textContent = `🚀 Gravar Todos Extraídos na Planilha (${readyToSendCount})`;
  } else {
    DOM.btnSendAllSheet.style.display = 'none';
  }

  // Atualiza barra de navegação do painel de revisão
  if (count > 0 && state.selectedIndex >= 0) {
    DOM.batchNavBar.style.display = 'flex';
    DOM.batchNavLabel.textContent = `Documento ${state.selectedIndex + 1} de ${count}`;
    DOM.btnPrevDoc.disabled = state.selectedIndex <= 0;
    DOM.btnNextDoc.disabled = state.selectedIndex >= count - 1;
  } else {
    DOM.batchNavBar.style.display = 'none';
  }

  if (count === 0) {
    DOM.batchThumbsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; font-size: 0.78rem; color: var(--text-dim); padding: 0.75rem 0;">
        Tire até 5 fotos ou envie arquivos. Depois clique em <b>Extrair Dados</b>.
      </div>
    `;
    return;
  }

  const statusLabels = {
    pending: 'Na fila',
    extracting: 'Lendo...',
    extracted: 'Extraído ✓',
    sent: 'Enviado ✓',
    error: 'Erro'
  };

  DOM.batchThumbsGrid.innerHTML = state.batchQueue.map((item, idx) => {
    const isActive = idx === state.selectedIndex ? 'active' : '';
    const statusClass = item.status;
    const thumbContent = item.previewUrl
      ? `<img src="${item.previewUrl}" alt="Doc ${idx + 1}">`
      : `<div class="batch-thumb-pdf">📄<br>${item.name || 'PDF'}</div>`;

    return `
      <div class="batch-thumb-item ${isActive} ${statusClass}" onclick="selectBatchItem(${idx})" title="Documento ${idx + 1}">
        ${thumbContent}
        <span class="batch-thumb-index">#${idx + 1}</span>
        <span class="batch-thumb-status">${statusLabels[item.status] || item.status}</span>
        ${!state.isScanning ? `<button class="batch-thumb-remove" type="button" onclick="event.stopPropagation(); removeBatchItem(${idx})" title="Remover">&times;</button>` : ''}
      </div>
    `;
  }).join('');
}

function addBatchItem(item) {
  if (state.batchQueue.length >= MAX_BATCH_SIZE) {
    showToast(`Limite máximo de ${MAX_BATCH_SIZE} documentos por lote atingido! Extraia ou limpe o lote atual.`, 'error', 4000);
    return false;
  }

  state.batchQueue.push({
    id: Date.now() + Math.random(),
    type: item.type, // 'base64' | 'file'
    imageBase64: item.imageBase64 || null,
    file: item.file || null,
    previewUrl: item.previewUrl || null,
    name: item.name || `Foto ${state.batchQueue.length + 1}`,
    status: 'pending',
    scanId: null,
    data: { data_recebimento: '', numero_processo: '', processo_sei: '' },
    errorMsg: ''
  });

  selectBatchItem(state.batchQueue.length - 1);
  renderBatchQueue();
  showToast(`Documento ${state.batchQueue.length}/${MAX_BATCH_SIZE} adicionado ao lote!`, 'info', 2000);
  return true;
}

window.removeBatchItem = function(index) {
  if (state.isScanning) return;
  state.batchQueue.splice(index, 1);
  if (state.batchQueue.length === 0) {
    state.selectedIndex = -1;
    clearReviewPanel();
  } else {
    const nextIdx = Math.min(index, state.batchQueue.length - 1);
    selectBatchItem(nextIdx);
  }
  renderBatchQueue();
};

window.selectBatchItem = function(index) {
  if (index < 0 || index >= state.batchQueue.length) return;
  state.selectedIndex = index;
  const item = state.batchQueue[index];

  state.lastScanId = item.scanId;
  state.currentExtractedData = item.data;

  if (item.previewUrl) {
    DOM.capturedImagePreview.src = item.previewUrl;
    DOM.capturedImagePreview.style.display = 'block';
    DOM.thumbPlaceholder.style.display = 'none';
  } else {
    DOM.capturedImagePreview.src = '';
    DOM.capturedImagePreview.style.display = 'none';
    DOM.thumbPlaceholder.innerHTML = `📄 Arquivo selecionado: <b>${item.name}</b>`;
    DOM.thumbPlaceholder.style.display = 'block';
  }

  populateForm(item.data || {});

  if (item.status === 'pending') {
    DOM.extractBadge.className = 'status-pill pending';
    DOM.extractBadge.textContent = 'Na fila (Aguardando Extração)';
    DOM.btnSendSheet.disabled = true;
  } else if (item.status === 'extracting') {
    DOM.extractBadge.className = 'status-pill pending';
    DOM.extractBadge.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Extraindo dados...';
    DOM.btnSendSheet.disabled = true;
  } else if (item.status === 'extracted') {
    DOM.extractBadge.className = 'status-pill success';
    DOM.extractBadge.textContent = 'Extração Concluída';
    DOM.btnSendSheet.disabled = false;
  } else if (item.status === 'sent') {
    DOM.extractBadge.className = 'status-pill success';
    DOM.extractBadge.textContent = 'Gravado na Planilha ✓';
    DOM.btnSendSheet.disabled = false;
  } else if (item.status === 'error') {
    DOM.extractBadge.className = 'status-pill error';
    DOM.extractBadge.textContent = 'Erro na Leitura';
    DOM.btnSendSheet.disabled = true;
  }

  renderBatchQueue();
};

function clearReviewPanel() {
  state.lastScanId = null;
  state.currentExtractedData = null;
  DOM.fieldDataRecebimento.value = '';
  DOM.fieldProcesso.value = '';
  DOM.fieldProcessoSei.value = '';
  DOM.capturedImagePreview.src = '';
  DOM.capturedImagePreview.style.display = 'none';
  DOM.thumbPlaceholder.innerHTML = 'Nenhuma captura realizada ainda.<br>Aponte o documento e clique em <b>Adicionar Foto da Câmera</b>.';
  DOM.thumbPlaceholder.style.display = 'block';
  DOM.btnSendSheet.disabled = true;
  DOM.extractBadge.className = 'status-pill pending';
  DOM.extractBadge.textContent = 'Aguardando Escaneio';
}

function clearBatch() {
  if (state.isScanning) return;
  state.batchQueue = [];
  state.selectedIndex = -1;
  clearReviewPanel();
  renderBatchQueue();
}

// EXTRAI TODOS OS DOCUMENTOS DO LOTE EM PARALELO (MUITO MAIS RÁPIDO)
async function extractBatch() {
  if (state.batchQueue.length === 0) return;

  if (!state.config.has_gemini_key) {
    await loadConfig();
  }
  if (!state.config.has_gemini_key) {
    showToast('Por favor, informe sua Chave de API do Gemini em Configurações (ícone ⚙️ no topo).', 'error', 6000);
    openSettingsModal();
    return;
  }

  state.isScanning = true;
  DOM.laserLine.classList.add('scanning');
  DOM.btnExtractBatch.disabled = true;

  const targetIndices = [];
  for (let i = 0; i < state.batchQueue.length; i++) {
    const item = state.batchQueue[i];
    if (item.status === 'pending' || item.status === 'error') {
      item.status = 'extracting';
      targetIndices.push(i);
    }
  }

  const totalToProcess = targetIndices.length;
  let completedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  DOM.btnExtractBatchText.innerHTML = `<span class="spinner"></span> Extraindo ${totalToProcess} em paralelo (0/${totalToProcess})...`;
  renderBatchQueue();
  if (state.selectedIndex >= 0) {
    selectBatchItem(state.selectedIndex);
  }

  const processOne = async (idx) => {
    const item = state.batchQueue[idx];
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let result;
        if (item.type === 'base64') {
          const resp = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: item.imageBase64 })
          });
          result = await parseJsonSafe(resp);
          if (!resp.ok) throw new Error(result.detail || 'Falha na análise');
        } else {
          const formData = new FormData();
          formData.append('file', item.file);
          const resp = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          result = await parseJsonSafe(resp);
          if (!resp.ok) throw new Error(result.detail || 'Falha ao processar arquivo');
          if (result.preview_url) {
            item.previewUrl = result.preview_url;
          }
        }

        item.scanId = result.scan_id;
        item.data = result.data || { data_recebimento: '', numero_processo: '', processo_sei: '' };
        item.status = 'extracted';
        successCount++;
        break;
      } catch (err) {
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        console.error(`Erro no documento ${idx + 1}:`, err);
        item.status = 'error';
        item.errorMsg = err.message;
        errorCount++;
      }
    }

    completedCount++;
    DOM.btnExtractBatchText.innerHTML = `<span class="spinner"></span> Extraindo (${completedCount}/${totalToProcess})...`;
    if (state.selectedIndex === idx) {
      selectBatchItem(idx);
    } else {
      renderBatchQueue();
    }
  };

  // Executa até 2 extrações simultâneas para manter alta velocidade sem sobrecarregar o túnel/API
  const concurrency = 2;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, targetIndices.length) }, async () => {
    while (cursor < targetIndices.length) {
      const nextIdx = targetIndices[cursor++];
      await processOne(nextIdx);
    }
  });
  await Promise.all(workers);

  state.isScanning = false;
  DOM.laserLine.classList.remove('scanning');
  renderBatchQueue();
  loadHistory();

  // Seleciona o primeiro documento extraído para revisão
  const firstExtracted = state.batchQueue.findIndex(i => i.status === 'extracted');
  if (firstExtracted >= 0) {
    selectBatchItem(firstExtracted);
  }

  if (errorCount === 0) {
    showToast(`✅ Extração paralela concluída para ${successCount} documento(s)!`, 'success', 5000);
  } else {
    showToast(`Extração finalizada: ${successCount} sucesso(s), ${errorCount} erro(s).`, 'error', 6000);
  }
}

// SINCRONIZA EDIÇÕES MANUAIS NO FORMULÁRIO COM O ITEM SELECIONADO NO LOTE
function syncFormToSelectedItem() {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.batchQueue.length) return;
  const item = state.batchQueue[state.selectedIndex];
  item.data = {
    data_recebimento: DOM.fieldDataRecebimento.value.trim(),
    numero_processo: DOM.fieldProcesso.value.trim(),
    processo_sei: DOM.fieldProcessoSei.value.trim()
  };
}

// PREENCHE OS CAMPOS DO FORMULÁRIO NA ORDEM DETERMINADA:
// 1. DATA (data_recebimento)
// 2. JUDICIAL (numero_processo)
// 3. SEI (processo_sei)
function populateForm(data) {
  DOM.fieldDataRecebimento.value = data.data_recebimento || '';
  DOM.fieldProcesso.value = data.numero_processo || '';
  DOM.fieldProcessoSei.value = data.processo_sei || '';
}

// ENVIA OS DADOS DO DOCUMENTO ATUAL PARA A PLANILHA GOOGLE
async function sendToGoogleSheets() {
  syncFormToSelectedItem();
  const valorData = DOM.fieldDataRecebimento.value.trim();
  const valorJudicial = DOM.fieldProcesso.value.trim();
  const valorSei = DOM.fieldProcessoSei.value.trim();

  const dados = {
    data: valorData,
    judicial: valorJudicial,
    sei: valorSei,
    data_recebimento: valorData,
    numero_processo: valorJudicial,
    processo_sei: valorSei
  };

  if (!dados.judicial) {
    showToast('Informe o número do processo judicial antes de enviar!', 'error');
    DOM.fieldProcesso.focus();
    return;
  }

  DOM.btnSendSheet.disabled = true;
  DOM.btnSendText.innerHTML = '<span class="spinner"></span> Enviando para o Google Sheets...';

  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scan_id: state.lastScanId,
        dados: dados
      })
    });

    const result = await parseJsonSafe(response);

    if (result.success) {
      if (state.selectedIndex >= 0 && state.batchQueue[state.selectedIndex]) {
        state.batchQueue[state.selectedIndex].status = 'sent';
        selectBatchItem(state.selectedIndex);
      }
      showToast('Mandado registrado com sucesso na Planilha do Google!', 'success', 5000);
      loadHistory();
    } else {
      showToast(`Aviso da planilha: ${result.message}`, 'error', 7000);
    }

  } catch (err) {
    console.error('Falha ao enviar:', err);
    showToast(`Erro de rede ao enviar: ${err.message}`, 'error');
  } finally {
    DOM.btnSendSheet.disabled = false;
    DOM.btnSendText.textContent = '🚀 Gravar Este na Planilha';
    renderBatchQueue();
  }
}

// ENVIA TODOS OS DOCUMENTOS EXTRAÍDOS DO LOTE PARA A PLANILHA GOOGLE EM UMA ÚNICA REQUISIÇÃO
async function sendAllToGoogleSheets() {
  syncFormToSelectedItem();
  const pendingIndices = [];
  state.batchQueue.forEach((item, idx) => {
    if (item.status === 'extracted') pendingIndices.push(idx);
  });
  if (pendingIndices.length === 0) return;

  DOM.btnSendAllSheet.disabled = true;
  DOM.btnSendAllText.innerHTML = `<span class="spinner"></span> Gravando ${pendingIndices.length} registro(s) na planilha...`;

  const payloadItems = pendingIndices.map(idx => {
    const item = state.batchQueue[idx];
    const d = item.data || {};
    return {
      scan_id: item.scanId,
      dados: {
        data: (d.data_recebimento || '').trim(),
        judicial: (d.numero_processo || '').trim(),
        sei: (d.processo_sei || '').trim(),
        data_recebimento: (d.data_recebimento || '').trim(),
        numero_processo: (d.numero_processo || '').trim(),
        processo_sei: (d.processo_sei || '').trim()
      }
    };
  });

  try {
    const response = await fetch('/api/send-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: payloadItems })
    });
    const result = await parseJsonSafe(response);

    if (result.success) {
      pendingIndices.forEach(idx => {
        state.batchQueue[idx].status = 'sent';
      });
      showToast(`✅ Todos os ${pendingIndices.length} documento(s) gravados na Planilha Oficial!`, 'success', 5000);
    } else {
      showToast(`Aviso da planilha: ${result.message}`, 'error', 7000);
    }
  } catch (err) {
    console.error('Falha no envio em lote:', err);
    showToast(`Erro de rede no envio em lote: ${err.message}`, 'error', 7000);
  } finally {
    if (state.selectedIndex >= 0) {
      selectBatchItem(state.selectedIndex);
    }
    renderBatchQueue();
    loadHistory();
  }
}

// CARREGA HISTÓRICO RECENTE
async function loadHistory() {
  try {
    const resp = await fetch('/api/history');
    const data = await resp.json();
    const rows = data.history || [];

    if (rows.length === 0) {
      DOM.historyTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">
            Nenhum mandado escaneado nesta sessão.
          </td>
        </tr>
      `;
      return;
    }

    DOM.historyTableBody.innerHTML = rows.map(item => {
      let pillClass = 'pending';
      let statusLabel = 'Aguardando';

      if (item.status_envio === 'enviado') {
        pillClass = 'success';
        statusLabel = 'Gravado na Planilha';
      } else if (item.status_envio === 'erro') {
        pillClass = 'error';
        statusLabel = 'Falha no Envio';
      }

      return `
        <tr>
          <td style="font-weight: 600; color: #34d399;">${item.data_recebimento || '-'}</td>
          <td style="font-weight: 700; color: #60a5fa;">${item.numero_processo || '-'}</td>
          <td style="font-weight: 600; color: #fbbf24;">${item.processo_sei || '-'}</td>
          <td><span class="status-pill ${pillClass}">${statusLabel}</span></td>
          <td style="color: var(--text-dim); font-size: 0.8rem;">${item.timestamp || '-'}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Falha ao carregar histórico:', err);
  }
}

// CARREGA E ATUALIZA STATUS DAS CONFIGURAÇÕES
async function loadConfig() {
  try {
    const resp = await fetch('/api/config');
    const data = await resp.json();
    state.config = data;

    // Atualiza badges da Navbar
    if (data.has_gemini_key) {
      DOM.dotGemini.className = 'status-dot active';
      DOM.textGemini.textContent = 'IA Gemini: Conectada';
    } else {
      DOM.dotGemini.className = 'status-dot inactive';
      DOM.textGemini.textContent = 'IA: Sem Chave';
    }

    const hasValidWebhook = data.webhook_url && data.webhook_url.includes('script.google.com') && !data.webhook_url.includes('SEU_SCRIPT_ID');
    if (hasValidWebhook) {
      DOM.dotSheet.className = 'status-dot active';
      DOM.textSheet.textContent = 'Planilha: Conectada';
    } else {
      DOM.dotSheet.className = 'status-dot';
      DOM.textSheet.textContent = 'Planilha: Não configurada';
    }

    // Preenche inputs do modal
    DOM.cfgWebhookUrl.value = data.webhook_url || '';
    DOM.cfgModelName.value = data.model_name || 'gemini-3.1-flash-lite';

    if (data.spreadsheet_url) {
      DOM.btnOpenSpreadsheet.href = data.spreadsheet_url;
    }

  } catch (err) {
    console.error('Falha ao obter configurações:', err);
  }
}

// SALVA CONFIGURAÇÕES
async function saveConfig() {
  const geminiKey = DOM.cfgGeminiKey.value.trim();
  const webhookUrl = DOM.cfgWebhookUrl.value.trim();
  const modelName = DOM.cfgModelName.value;

  const payload = {
    webhook_url: webhookUrl,
    model_name: modelName
  };

  if (geminiKey) {
    payload.gemini_api_key = geminiKey;
  }

  DOM.btnSaveSettings.disabled = true;
  DOM.btnSaveSettings.textContent = 'Salvando...';

  try {
    const resp = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await resp.json();
    if (res.success) {
      showToast('Configurações salvas com sucesso!', 'success');
      closeSettingsModal();
      await loadConfig();
    } else {
      showToast('Erro ao salvar configurações.', 'error');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  } finally {
    DOM.btnSaveSettings.disabled = false;
    DOM.btnSaveSettings.textContent = 'Salvar Configurações';
  }
}

// TESTA O WEBHOOK DO GOOGLE APPS SCRIPT
async function testWebhook() {
  DOM.btnTestWebhook.disabled = true;
  DOM.btnTestWebhook.innerHTML = '<span class="spinner"></span> Testando conexão com o Google Sheets...';

  try {
    const resp = await fetch('/api/test-webhook', { method: 'POST' });
    const res = await resp.json();

    if (res.success) {
      showToast('✅ Conexão bem-sucedida! Uma linha de teste foi gravada na sua planilha.', 'success', 6000);
    } else {
      showToast(`⚠️ Falha na conexão: ${res.message}`, 'error', 7000);
    }
  } catch (err) {
    showToast(`Erro de rede ao testar: ${err.message}`, 'error');
  } finally {
    DOM.btnTestWebhook.disabled = false;
    DOM.btnTestWebhook.textContent = '🧪 Testar Conexão com a Planilha Google Agora';
  }
}

// REDIMENSIONA E COMPRIME IMAGENS NO NAVEGADOR (REDUZ FOTOS DE 10MB PARA ~180KB ANTES DO ENVIO)
function compressImageFileToBase64(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ADICIONA ARQUIVOS (FOTOS OU PDFS) AO LOTE DE ATÉ 5 DOCUMENTOS
async function queueUploadedFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (state.batchQueue.length >= MAX_BATCH_SIZE) {
      showToast(`Limite de ${MAX_BATCH_SIZE} documentos atingido. Alguns arquivos extras não foram adicionados.`, 'error', 5000);
      break;
    }

    if (file.type && file.type.startsWith('image/')) {
      try {
        const compressedBase64 = await compressImageFileToBase64(file);
        addBatchItem({
          type: 'base64',
          imageBase64: compressedBase64,
          previewUrl: compressedBase64,
          name: file.name
        });
      } catch (err) {
        console.warn('Falha ao comprimir no navegador, enviando arquivo original:', err);
        addBatchItem({
          type: 'file',
          file: file,
          previewUrl: null,
          name: file.name
        });
      }
    } else {
      addBatchItem({
        type: 'file',
        file: file,
        previewUrl: null,
        name: file.name
      });
    }
  }
}

// MODAL CONTROLS
function openSettingsModal() {
  DOM.settingsModal.classList.add('active');
  DOM.scriptCodePreview.textContent = APPS_SCRIPT_SOURCE;
}

function closeSettingsModal() {
  DOM.settingsModal.classList.remove('active');
}

// EVENT LISTENERS
DOM.btnCapture.addEventListener('click', () => {
  if (!state.currentStream) {
    // Se não houver stream de vídeo ativo (ex: celular via HTTP), abre a câmera nativa do aparelho
    DOM.mobileCameraInput.click();
    return;
  }
  const frameBase64 = captureFrameAsBase64();
  addBatchItem({
    type: 'base64',
    imageBase64: frameBase64,
    previewUrl: frameBase64,
    name: `Câmera #${state.batchQueue.length + 1}`
  });
});

if (DOM.btnMobileCamera && DOM.mobileCameraInput) {
  DOM.btnMobileCamera.addEventListener('click', () => DOM.mobileCameraInput.click());
  DOM.mobileCameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      queueUploadedFiles(e.target.files);
      e.target.value = '';
    }
  });
}

DOM.btnExtractBatch.addEventListener('click', extractBatch);
DOM.btnClearBatch.addEventListener('click', clearBatch);
DOM.btnSendAllSheet.addEventListener('click', sendAllToGoogleSheets);

DOM.btnPrevDoc.addEventListener('click', () => {
  if (state.selectedIndex > 0) selectBatchItem(state.selectedIndex - 1);
});

DOM.btnNextDoc.addEventListener('click', () => {
  if (state.selectedIndex < state.batchQueue.length - 1) selectBatchItem(state.selectedIndex + 1);
});

[DOM.fieldDataRecebimento, DOM.fieldProcesso, DOM.fieldProcessoSei].forEach(el => {
  el.addEventListener('input', syncFormToSelectedItem);
});

DOM.cameraSelect.addEventListener('change', (e) => {
  initCamera(e.target.value);
});

DOM.btnSwitchCamera.addEventListener('click', () => {
  if (state.videoDevices.length > 1) {
    const currentIndex = state.videoDevices.findIndex(d => d.deviceId === DOM.cameraSelect.value);
    const nextIndex = (currentIndex + 1) % state.videoDevices.length;
    DOM.cameraSelect.value = state.videoDevices[nextIndex].deviceId;
    initCamera(state.videoDevices[nextIndex].deviceId);
  }
});

DOM.btnSendSheet.addEventListener('click', sendToGoogleSheets);

DOM.btnClearForm.addEventListener('click', () => {
  DOM.fieldDataRecebimento.value = '';
  DOM.fieldProcesso.value = '';
  DOM.fieldProcessoSei.value = '';
  DOM.capturedImagePreview.src = '';
  DOM.capturedImagePreview.style.display = 'none';
  DOM.thumbPlaceholder.style.display = 'block';
  DOM.btnSendSheet.disabled = true;
  DOM.extractBadge.className = 'status-pill pending';
  DOM.extractBadge.textContent = 'Aguardando Escaneio';
});

DOM.btnCopyProcesso.addEventListener('click', () => {
  const val = DOM.fieldProcesso.value.trim();
  if (val) {
    navigator.clipboard.writeText(val);
    showToast('Número do processo copiado para a área de transferência!', 'info', 2000);
  }
});

DOM.btnRefreshHistory.addEventListener('click', loadHistory);

// Dropzone Drag and Drop
DOM.dropzone.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    queueUploadedFiles(e.target.files);
    e.target.value = '';
  }
});

DOM.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  DOM.dropzone.style.borderColor = 'var(--accent-blue)';
});

DOM.dropzone.addEventListener('dragleave', () => {
  DOM.dropzone.style.borderColor = 'var(--border-color)';
});

DOM.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  DOM.dropzone.style.borderColor = 'var(--border-color)';
  if (e.dataTransfer.files.length > 0) {
    queueUploadedFiles(e.dataTransfer.files);
  }
});

// Modais e Tabs
DOM.btnOpenSettings.addEventListener('click', openSettingsModal);
DOM.btnCloseSettings.addEventListener('click', closeSettingsModal);
DOM.btnCancelSettings.addEventListener('click', closeSettingsModal);
DOM.btnSaveSettings.addEventListener('click', saveConfig);
DOM.btnTestWebhook.addEventListener('click', testWebhook);

DOM.btnCopyScriptCode.addEventListener('click', () => {
  navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
  showToast('Código do Google Apps Script copiado!', 'success', 3000);
});

document.querySelectorAll('.modal-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
    
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).style.display = 'block';
  });
});

// INICIALIZAÇÃO GERAL AO CARREGAR
window.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await initCamera();
  await loadHistory();
});

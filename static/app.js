// ESTADO GLOBAL DA APLICAÇÃO
const state = {
  currentStream: null,
  activeDeviceId: null,
  videoDevices: [],
  lastScanId: null,
  currentExtractedData: null,
  isScanning: false,
  config: {
    has_gemini_key: false,
    webhook_url: '',
    spreadsheet_url: '',
    model_name: 'gemini-3.1-flash-lite'
  }
};

// CÓDIGO DO APPS SCRIPT PARA O TUTORIAL
const APPS_SCRIPT_SOURCE = `// Nome da aba de destino na sua planilha
var NOME_DA_ABA = "test_scan_cdj";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Webhook do ScanJudicial está ativo e gravando na aba " + NOME_DA_ABA + "!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
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

    if (sheet.getLastRow() === 0) {
      var cabecalho = [
        "Data de Autuação",
        "Processo Judicial",
        "Processo SEI",
        "Observações"
      ];
      sheet.appendRow(cabecalho);
      var headerRange = sheet.getRange(1, 1, 1, cabecalho.length);
      headerRange.setBackground("#1a365d");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    // Ordem estrita: Data de Autuação, Processo Judicial, Processo SEI, Observações
    var novaLinha = [
      data.data_autuacao || data.data_recebimento || "-",
      data.processo_judicial || data.numero_processo || "-",
      data.processo_sei || "-",
      data.observacoes || data.responsavel || "-"
    ];

    sheet.appendRow(novaLinha);
    var insertedRow = sheet.getLastRow();
    sheet.getRange(insertedRow, 2, 1, 2).setNumberFormat("@");

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Registro gravado com sucesso na planilha!",
      linha_inserida: insertedRow
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
  
  // Painel de Revisão (Ordem: 1. Data de Autuação, 2. Processo Judicial, 3. Processo SEI, 4. Observações)
  previewContainer: document.getElementById('previewContainer'),
  thumbPlaceholder: document.getElementById('thumbPlaceholder'),
  capturedImagePreview: document.getElementById('capturedImagePreview'),
  extractBadge: document.getElementById('extractBadge'),
  fieldDataRecebimento: document.getElementById('fieldDataRecebimento'),
  fieldProcesso: document.getElementById('fieldProcesso'),
  fieldProcessoSei: document.getElementById('fieldProcessoSei'),
  fieldResponsavel: document.getElementById('fieldResponsavel'),
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

// CAPTURA FRAME DA CÂMERA EM ALTA DEFINIÇÃO
function captureFrameAsBase64() {
  const video = DOM.video;
  const canvas = DOM.canvas;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.92);
}

// REALIZA ANÁLISE COM A IA GEMINI
async function analyzeImage(imageBase64) {
  if (!state.config.has_gemini_key) {
    await loadConfig();
  }
  if (!state.config.has_gemini_key) {
    showToast('Por favor, informe sua Chave de API do Gemini em Configurações (ícone ⚙️ no topo).', 'error', 6000);
    openSettingsModal();
    return;
  }

  // Ativa efeitos visuais de escaneamento
  state.isScanning = true;
  DOM.laserLine.classList.add('scanning');
  DOM.btnCapture.disabled = true;
  DOM.btnCaptureText.innerHTML = '<span class="spinner"></span> Analisando com IA...';
  DOM.extractBadge.className = 'status-pill pending';
  DOM.extractBadge.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Extraindo dados...';

  // Exibe miniatura
  DOM.capturedImagePreview.src = imageBase64;
  DOM.capturedImagePreview.style.display = 'block';
  DOM.thumbPlaceholder.style.display = 'none';

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || 'Falha na análise do documento');
    }

    state.lastScanId = result.scan_id;
    state.currentExtractedData = result.data;
    populateForm(result.data);

    DOM.extractBadge.className = 'status-pill success';
    DOM.extractBadge.textContent = 'Extração Concluída';
    DOM.btnSendSheet.disabled = false;

    showToast('Dados do processo e do carimbo extraídos com sucesso!', 'success');
    loadHistory();

  } catch (err) {
    console.error('Erro na análise:', err);
    DOM.extractBadge.className = 'status-pill error';
    DOM.extractBadge.textContent = 'Erro na Leitura';
    showToast(`Erro na análise: ${err.message}`, 'error', 6000);
  } finally {
    state.isScanning = false;
    DOM.laserLine.classList.remove('scanning');
    DOM.btnCapture.disabled = false;
    DOM.btnCaptureText.textContent = 'Escanear Documento';
  }
}

// PREENCHE OS CAMPOS DO FORMULÁRIO NA ORDEM DETERMINADA:
// 1. Data de Autuação (data_recebimento)
// 2. Processo Judicial (numero_processo)
// 3. Processo SEI (processo_sei)
// 4. Observações / Pessoa que recebe (responsavel)
function populateForm(data) {
  DOM.fieldDataRecebimento.value = data.data_recebimento || '';
  DOM.fieldProcesso.value = data.numero_processo || '';
  DOM.fieldProcessoSei.value = data.processo_sei || '';
  DOM.fieldResponsavel.value = data.responsavel || '';
}

// ENVIA OS DADOS PARA A PLANILHA GOOGLE NA ORDEM: DATA DE AUTUAÇÃO, PROCESSO JUDICIAL, PROCESSO SEI, OBSERVAÇÕES
async function sendToGoogleSheets() {
  const dataAutuacao = DOM.fieldDataRecebimento.value.trim();
  const processoJudicial = DOM.fieldProcesso.value.trim();
  const processoSei = DOM.fieldProcessoSei.value.trim();
  const observacoes = DOM.fieldResponsavel.value.trim();

  const dados = {
    nome_aba: "test_scan_cdj",
    data_autuacao: dataAutuacao,
    processo_judicial: processoJudicial,
    processo_sei: processoSei,
    observacoes: observacoes,
    data_recebimento: dataAutuacao,
    numero_processo: processoJudicial,
    responsavel: observacoes
  };

  if (!dados.processo_judicial) {
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

    const result = await response.json();

    if (result.success) {
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
    DOM.btnSendText.textContent = '🚀 Gravar na Planilha Google';
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
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">
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
          <td>${item.responsavel || '-'}</td>
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

// UPLOAD DE ARQUIVO MANUAL (IMAGEM OU PDF)
async function handleFileUpload(file) {
  if (!state.config.has_gemini_key) {
    await loadConfig();
  }
  if (!state.config.has_gemini_key) {
    showToast('Por favor, informe sua Chave de API do Gemini em Configurações.', 'error');
    openSettingsModal();
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  DOM.extractBadge.className = 'status-pill pending';
  DOM.extractBadge.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Processando arquivo...';

  try {
    const resp = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await resp.json();
    if (!resp.ok) {
      throw new Error(result.detail || 'Falha ao processar arquivo');
    }

    state.lastScanId = result.scan_id;
    state.currentExtractedData = result.data;
    populateForm(result.data);

    if (result.preview_url) {
      DOM.capturedImagePreview.src = result.preview_url;
      DOM.capturedImagePreview.style.display = 'block';
      DOM.thumbPlaceholder.style.display = 'none';
    }

    DOM.extractBadge.className = 'status-pill success';
    DOM.extractBadge.textContent = 'Arquivo Analisado';
    DOM.btnSendSheet.disabled = false;

    showToast('Documento carregado e analisado pela IA com sucesso!', 'success');
    loadHistory();

  } catch (err) {
    showToast(`Erro no upload: ${err.message}`, 'error');
    DOM.extractBadge.className = 'status-pill error';
    DOM.extractBadge.textContent = 'Falha no Arquivo';
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
  analyzeImage(frameBase64);
});

if (DOM.btnMobileCamera && DOM.mobileCameraInput) {
  DOM.btnMobileCamera.addEventListener('click', () => DOM.mobileCameraInput.click());
  DOM.mobileCameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
      e.target.value = '';
    }
  });
}

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
  DOM.fieldResponsavel.value = '';
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
    handleFileUpload(e.target.files[0]);
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
    handleFileUpload(e.dataTransfer.files[0]);
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

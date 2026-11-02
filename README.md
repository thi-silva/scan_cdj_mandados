# ⚖️ ScanJudicial - Leitor Inteligente de Mandados e Processos com IA

Sistema inteligente para leitura automática de **Mandados Judiciais** e **Carimbos de Recebimento** via câmera do usuário (webcam, celular ou scanner) com integração direta à **Planilha de Controle de Processos do Google Sheets**.

---

## 🎯 Objetivos e Funcionalidades

1. **Captura em Tempo Real pela Câmera**:
   - Acesso à câmera do operador (webcam USB ou câmera do smartphone).
   - Moldura inteligente e animação laser para enquadramento do documento.
   - Alternância rápida entre câmeras (frontal e traseira).
   - Suporte também a envio de arquivos (imagens JPG/PNG ou PDFs escaneados).

2. **Extração Especializada com IA (Google Gemini)**:
   - **Número do Processo Judicial**: Extrai no formato padrão CNJ (ex: `0001234-56.2026.8.00.0001`), localizado no campo `Processo nº:`.
   - **Data de Recebimento**: Leitura precisa da caligrafia ou dígitos dentro do carimbo `RECEBIDO EM: DD/MM/AAAA`.
   - **Hora do Recebimento**: Leitura da hora no carimbo (ex: `14:30`).
   - **Responsável / Matrícula**: Identificação do atendente/servidor que recebeu (ex: `Nome do Servidor - Mat. 000.000-0`).
   - **Partes do Processo**: Demandante (Autor) e Demandado (Réu).
   - **Tipo e Vara**: Ex: `MANDADO DE NOTIFICAÇÃO`, `1ª Vara da Fazenda Pública`.

3. **Integração com o Google Sheets**:
   - Gravação instantânea na sua planilha de controle (aba `test_scan_cdj`).
   - Implementado via **Google Apps Script Webhook** (sem necessidade de burocracias no Google Cloud Console).
   - Confirmação visual em tela e registro de histórico local no SQLite.

---

## 🚀 Como Iniciar

### Opção 1: Clique Duplo no Windows
Basta dar dois cliques no arquivo:
```
iniciar.bat
```
O sistema iniciará o servidor e abrirá automaticamente o navegador em `http://localhost:8000`.

### Opção 2: Pelo Terminal / Linha de Comando
```bash
py run.py
```

---

## ⚙️ Configuração Passo a Passo (2 Minutos)

### 1. Obter a Chave Gratuita da IA Gemini
1. Acesse o [Google AI Studio](https://aistudio.google.com/app/apikey) com sua conta Google.
2. Clique em **"Create API Key"** e copie a chave gerada.
3. No painel do ScanJudicial, clique no botão **⚙️ Configurações** no topo direito.
4. Cole sua chave no campo **Chave de API do Google Gemini** e clique em Salvar.

### 2. Conectar sua Planilha Google
1. Abra a sua planilha do Google onde deseja controlar os processos.
2. No menu superior da planilha, clique em **Extensões** > **Apps Script**.
3. Apague qualquer código existente e cole o conteúdo do arquivo [`google_apps_script.js`](./google_apps_script.js) (você também pode clicar no botão "Copiar Código Completo" dentro do painel de configurações do aplicativo).
4. Clique no ícone de **Salvar** (disquete).
5. No topo direito, clique em **Implantar** > **Nova implantação**:
   - Tipo: **Aplicativo da Web**
   - Executar como: **Eu (seu email)**
   - Quem tem acesso: **Qualquer pessoa (Anyone)**
6. Clique em **Implantar**, autorize o acesso da sua conta Google e copie a **URL do aplicativo da Web** (terminada em `/exec`).
7. Cole essa URL no painel de **⚙️ Configurações** do ScanJudicial e clique em **Testar Conexão**. Uma linha de teste será imediatamente gravada na sua planilha!

---

## 📁 Estrutura dos Arquivos

```
cdj_scan_mandados/
│
├── app.py                   # Servidor FastAPI com rotas da IA e API
├── streamlit_app.py         # Versão para Streamlit Cloud / Mobile
├── config.py                # Gerenciador de configurações locais
├── config.example.json      # Modelo de arquivo de configuração (sem chaves)
├── database.py              # Banco SQLite para histórico local
├── extractor.py             # Motor multimodal do Google Gemini para mandados
├── google_sheets.py         # Cliente de envio para o Google Sheets via Webhook
├── google_apps_script.js    # Código pronto para colar no Apps Script da Planilha
├── run.py                   # Inicializador que abre o navegador automaticamente
├── iniciar.bat              # Atalho de execução para Windows (FastAPI)
├── iniciar_streamlit.bat    # Atalho de execução para Windows (Streamlit)
├── requirements.txt         # Dependências do Python
└── static/
    ├── index.html           # Interface web moderna com câmera ao vivo
    ├── style.css            # Estilos modernos com Glassmorphism e tema escuro
    └── app.js               # Lógica de captura de vídeo e comunicação com o backend
```

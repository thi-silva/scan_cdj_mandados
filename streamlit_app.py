import streamlit as st
from PIL import Image
import io
import json
import requests
from config import load_config, save_config
from extractor import extract_with_gemini, SYSTEM_INSTRUCTION
from google_sheets import send_to_google_sheets

st.set_page_config(
    page_title="ScanJudicial Mobile - Mandados & Carimbos",
    page_icon="⚖️",
    layout="centered",
    initial_sidebar_state="collapsed"
)

# Estilização CSS para visual moderno e responsivo em celular
st.markdown("""
<style>
    .main-header {
        text-align: center;
        padding: 0.5rem 0 1rem 0;
    }
    .main-title {
        font-size: 1.8rem;
        font-weight: 800;
        background: linear-gradient(135deg, #2563eb, #8b5cf6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0.2rem;
    }
    .sub-title {
        color: #64748b;
        font-size: 0.9rem;
    }
    .stButton>button {
        width: 100%;
        border-radius: 12px;
        font-weight: 700;
        padding: 0.6rem 1rem;
    }
</style>
""", unsafe_allow_html=True)

# Carrega configurações locais ou de st.secrets (para Streamlit Cloud)
cfg = load_config()

def get_secret_or_cfg(secret_key: str, cfg_key: str, default: str = "") -> str:
    try:
        if secret_key in st.secrets:
            return st.secrets[secret_key]
    except Exception:
        pass
    return cfg.get(cfg_key, default)

# Prioriza Streamlit Secrets se existirem (para deploy na nuvem)
gemini_key = get_secret_or_cfg("GEMINI_API_KEY", "gemini_api_key")
webhook_url = get_secret_or_cfg("WEBHOOK_URL", "webhook_url")
spreadsheet_url = get_secret_or_cfg("SPREADSHEET_URL", "spreadsheet_url")
model_name = "gemini-3.1-flash-lite"

# BARRA LATERAL: CONFIGURAÇÕES
with st.sidebar:
    st.header("⚙️ Configurações")
    gemini_key_input = st.text_input("Chave Google Gemini", value=gemini_key, type="password")
    webhook_url_input = st.text_input("Webhook Google Sheets", value=webhook_url)
    
    if st.button("Salvar Configurações"):
        save_config({
            "gemini_api_key": gemini_key_input,
            "webhook_url": webhook_url_input
        })
        gemini_key = gemini_key_input
        webhook_url = webhook_url_input
        st.success("Configurações salvas!")

    st.markdown("---")
    st.markdown(f"[📊 Abrir Planilha Google]({spreadsheet_url})")

# CABEÇALHO
st.markdown("""
<div class="main-header">
    <div class="main-title">⚖️ ScanJudicial Mobile</div>
    <div class="sub-title">Leitor de Mandados Judiciais e Carimbos de Recebimento</div>
</div>
""", unsafe_allow_html=True)

# ABAS: CÂMERA OU UPLOAD
tab_camera, tab_upload = st.tabs(["📷 Tirar Foto (Câmera)", "📁 Enviar Arquivo"])

image_to_process = None

with tab_camera:
    st.info("Aponte a câmera para o documento, enquadrando o cabeçalho e o carimbo de recebimento.")
    camera_photo = st.camera_input("Fotografar Mandado Judicial")
    if camera_photo:
        image_to_process = camera_photo.getvalue()

with tab_upload:
    uploaded_file = st.file_uploader("Selecione foto ou PDF", type=["jpg", "jpeg", "png", "pdf"])
    if uploaded_file:
        file_bytes = uploaded_file.getvalue()
        if uploaded_file.name.lower().endswith(".pdf"):
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            if len(reader.pages) > 0 and len(reader.pages[0].images) > 0:
                image_to_process = reader.pages[0].images[0].data
            else:
                st.error("O PDF não contém imagem de escaneamento legível.")
        else:
            image_to_process = file_bytes

# PROCESSAMENTO COM IA GEMINI
if image_to_process:
    st.markdown("---")
    st.subheader("🔍 Análise do Documento")
    
    # Exibe imagem
    col_img, col_info = st.columns([1, 1])
    with col_img:
        st.image(image_to_process, caption="Captura do Documento", use_container_width=True)

    if not gemini_key:
        st.error("Chave do Gemini não configurada! Abra a barra lateral para inserir sua chave.")
    else:
        # Estado de sessão para os dados extraídos
        if "last_processed" not in st.session_state or st.session_state.get("last_img") != hash(image_to_process):
            with st.spinner("🤖 IA Gemini lendo o número do processo e o carimbo manuscrito..."):
                try:
                    extracted = extract_with_gemini(image_to_process, gemini_key, model_name)
                    st.session_state["extracted_data"] = extracted
                    st.session_state["last_img"] = hash(image_to_process)
                    st.toast("Extração concluída com sucesso!", icon="✨")
                except Exception as e:
                    st.error(f"Erro na análise: {e}")
                    st.session_state["extracted_data"] = None

        data = st.session_state.get("extracted_data")
        if data:
            st.success("✨ Dados Identificados pela IA:")
            
            with st.form("form_mandado"):
                data_rec = st.text_input(
                    "1. 📅 Data de Autuação (Data do Recebimento no Carimbo)",
                    value=data.get("data_recebimento", "")
                )
                num_processo = st.text_input(
                    "2. 📌 Processo Judicial (Número do Processo)", 
                    value=data.get("numero_processo", "")
                )
                proc_sei = st.text_input(
                    "3. 📄 Processo SEI (Anotado no Papel — Final /XXXX-XX)",
                    value=data.get("processo_sei", "")
                )
                responsavel = st.text_input(
                    "4. 👤 Observações (Pessoa que Recebe no Carimbo)",
                    value=data.get("responsavel", "")
                )

                submit = st.form_submit_button("🚀 Gravar na Planilha Google (aba test_scan_cdj)", type="primary")

                if submit:
                    payload = {
                        "nome_aba": "test_scan_cdj",
                        "data_autuacao": data_rec.strip(),
                        "processo_judicial": num_processo.strip(),
                        "processo_sei": proc_sei.strip(),
                        "observacoes": responsavel.strip(),
                        "data_recebimento": data_rec.strip(),
                        "numero_processo": num_processo.strip(),
                        "responsavel": responsavel.strip(),
                    }

                    with st.spinner("Enviando para a Planilha Google..."):
                        res = send_to_google_sheets(webhook_url, payload)
                        if res.get("success"):
                            st.balloons()
                            st.success("✅ Mandado registrado com sucesso na aba **test_scan_cdj**!")
                            st.markdown(f"[👉 Abrir Planilha para Conferir]({spreadsheet_url})")
                        else:
                            st.error(f"Erro ao gravar: {res.get('message')}")

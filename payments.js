// ================================================================
// VendaFácil — js/payments.js
// Integração de pagamentos: Stripe (Cartão) + Pix via IMAP
// ================================================================

// Lê configurações injetadas pelo servidor (ver env-config.html)
const PAYMENT_CONFIG = window.PAYMENT_CONFIG || {
  stripe_enabled: false,
  pix_enabled: false,
  pix_chave: '',
  pix_beneficiario: 'VendaFácil',
  pix_cidade: 'Recife',
  stripe_public_key: ''
};

// ================================================================
// STRIPE — Pagamento com Cartão
// Para habilitar: adicione STRIPE_PUBLIC_KEY no .env
// ================================================================

const StripePayment = {
  stripe: null,
  elements: null,

  isAvailable() {
    return PAYMENT_CONFIG.stripe_enabled && !!PAYMENT_CONFIG.stripe_public_key;
  },

  async init() {
    if (!this.isAvailable()) return false;
    if (typeof window.Stripe === 'undefined') {
      console.warn('[Stripe] SDK não carregado. Adicione <script src="https://js.stripe.com/v3/"></script>');
      return false;
    }
    this.stripe = window.Stripe(PAYMENT_CONFIG.stripe_public_key);
    return true;
  },

  /**
   * Criar sessão de checkout para assinatura
   * @param {string} plano - 'basico' | 'profissional' | 'anual'
   * @param {string} userId - ID do usuário no Supabase
   */
  async createCheckoutSession(plano, userId) {
    if (!this.isAvailable()) {
      throw new Error('Stripe não configurado');
    }

    // Esta chamada vai para seu backend/Edge Function no Supabase
    // POST /api/payments/stripe/create-checkout
    const response = await fetch('/api/payments/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano, userId })
    });

    const { sessionId, error } = await response.json();
    if (error) throw new Error(error);

    // Redirecionar para o Stripe Checkout
    await this.init();
    const { error: stripeError } = await this.stripe.redirectToCheckout({ sessionId });
    if (stripeError) throw stripeError;
  }
};

// ================================================================
// PIX — Pagamento via Pix (exibido como "Pagar com Pix")
// A confirmação é feita via polling IMAP no backend
// Para habilitar: configure as variáveis IMAP_* no .env
// ================================================================

const PixPayment = {

  isAvailable() {
    return PAYMENT_CONFIG.pix_enabled && !!PAYMENT_CONFIG.pix_chave;
  },

  /**
   * Gera payload Pix (EMV/BR Code) para exibição e QR code
   * Spec: BACEN Manual de Padrões para Iniciação do Pix
   */
  gerarPayload({ chave, beneficiario, cidade, valor, txid }) {
    const sanitize = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 25);

    const formatField = (id, value) => {
      const len = String(value.length).padStart(2, '0');
      return `${id}${len}${value}`;
    };

    const merchantAccountInfo = formatField('00', 'BR.GOV.BCB.PIX') + formatField('01', chave);
    const merchantAccount = formatField('26', merchantAccountInfo);

    const txidField = formatField('05', txid || '***');
    const addData = formatField('62', txidField);

    let payload =
      formatField('00', '01') +         // Payload Format Indicator
      merchantAccount +                  // Merchant Account Information
      formatField('52', '0000') +        // MCC
      formatField('53', '986') +         // Transaction Currency (BRL)
      (valor ? formatField('54', valor.toFixed(2)) : '') +
      formatField('58', 'BR') +          // Country Code
      formatField('59', sanitize(beneficiario)) +
      formatField('60', sanitize(cidade)) +
      addData;

    // CRC16 CCITT
    payload += '6304';
    const crc = this._crc16(payload);
    return payload + crc.toString(16).toUpperCase().padStart(4, '0');
  },

  _crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xFFFF;
      }
    }
    return crc;
  },

  /**
   * Gera QR Code como Data URL usando a lib qrcode.js
   * Inclua no HTML: <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
   */
  async gerarQRCode(payload, elementId) {
    if (typeof QRCode === 'undefined') {
      console.warn('[Pix] QRCode.js não carregado');
      return null;
    }
    const el = document.getElementById(elementId);
    if (!el) return null;
    el.innerHTML = '';
    new QRCode(el, {
      text: payload,
      width: 160, height: 160,
      colorDark: '#1E293B', colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
    return payload;
  },

  /**
   * Inicia polling para verificar pagamento Pix via backend IMAP
   * O backend verifica a caixa de e-mail e confirma o pagamento
   */
  async aguardarConfirmacao({ pedidoId, valor, onConfirmado, onTimeout, timeoutMs = 300000 }) {
    const inicioMs = Date.now();
    const intervalo = 5000; // verificar a cada 5s

    const verificar = async () => {
      if (Date.now() - inicioMs > timeoutMs) {
        onTimeout?.();
        return;
      }

      try {
        // Endpoint no seu backend que verifica IMAP
        const res = await fetch(`/api/payments/pix/status?pedidoId=${pedidoId}`);
        const { pago, valor_recebido } = await res.json();

        if (pago) {
          onConfirmado?.({ valor_recebido });
          return;
        }
      } catch (e) {
        console.warn('[Pix] Erro ao verificar status:', e);
      }

      setTimeout(verificar, intervalo);
    };

    setTimeout(verificar, intervalo);
  }
};

// ================================================================
// UI — Componente de Modal de Pagamento
// ================================================================

const PaymentUI = {

  /**
   * Renderiza os métodos de pagamento disponíveis
   * Mostra "Indisponível" se não configurado
   */
  renderMethods(container) {
    const methods = [
      {
        id: 'pix',
        icon: '★',
        name: 'Pagar com Pix',
        desc: 'Instantâneo · Sem taxas · QR Code',
        available: PixPayment.isAvailable()
      },
      {
        id: 'stripe',
        icon: '▣',
        name: 'Cartão de Crédito / Débito',
        desc: 'Visa, Mastercard, Elo, Amex',
        available: StripePayment.isAvailable()
      }
    ];

    container.innerHTML = methods.map(m => `
      <div class="payment-method ${m.available ? '' : 'unavailable'}" 
           data-method="${m.id}"
           ${m.available ? `onclick="PaymentUI.selectMethod('${m.id}')"` : ''}>
        <div class="pm-icon">${m.icon}</div>
        <div class="pm-info">
          <div class="pm-name">${m.name}</div>
          <div class="pm-desc">${m.desc}</div>
        </div>
        <span class="pm-badge ${m.available ? 'available' : 'unavailable'}">
          ${m.available ? 'Disponível' : 'Indisponível'}
        </span>
      </div>
    `).join('');
  },

  selectMethod(id) {
    document.querySelectorAll('.payment-method').forEach(el => {
      el.classList.toggle('selected', el.dataset.method === id);
    });

    const pixPanel = document.getElementById('pixPanel');
    if (pixPanel) {
      if (id === 'pix') {
        this.initPixPanel();
        pixPanel.classList.add('visible');
      } else {
        pixPanel.classList.remove('visible');
      }
    }
  },

  async initPixPanel() {
    if (!PixPayment.isAvailable()) return;

    const pedidoId = 'VF-' + Date.now();
    const payload = PixPayment.gerarPayload({
      chave: PAYMENT_CONFIG.pix_chave,
      beneficiario: PAYMENT_CONFIG.pix_beneficiario,
      cidade: PAYMENT_CONFIG.pix_cidade,
      valor: window._pixValor || 0,
      txid: pedidoId
    });

    // Exibir chave Pix
    const keyEl = document.getElementById('pixKeyDisplay');
    if (keyEl) keyEl.textContent = PAYMENT_CONFIG.pix_chave;

    // Gerar QR Code
    await PixPayment.gerarQRCode(payload, 'pixQrCode');

    // Copiar código
    window._pixPayload = payload;

    // Aguardar confirmação
    const statusDot = document.getElementById('pixStatusDot');
    const statusText = document.getElementById('pixStatusText');

    PixPayment.aguardarConfirmacao({
      pedidoId,
      valor: window._pixValor,
      onConfirmado: ({ valor_recebido }) => {
        if (statusDot) statusDot.classList.add('confirmed');
        if (statusText) statusText.textContent = 'Pagamento confirmado!';
        showToast('Pagamento Pix confirmado! Obrigado.', 'success');
        setTimeout(() => closePaymentModal(), 2000);
      },
      onTimeout: () => {
        if (statusText) statusText.textContent = 'Tempo expirado. Tente novamente.';
      }
    });
  }
};

// ================================================================
// Copiar código Pix
// ================================================================

function copyPixCode() {
  if (window._pixPayload) {
    navigator.clipboard.writeText(window._pixPayload).then(() => {
      showToast('Código Pix copiado!', 'success');
    });
  }
}

function closePaymentModal() {
  const modal = document.getElementById('paymentModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function openPaymentModal(plano, valor) {
  window._pixValor = valor;
  window._planoSelecionado = plano;

  const modal = document.getElementById('paymentModal');
  if (!modal) return;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  const container = document.getElementById('paymentMethods');
  if (container) PaymentUI.renderMethods(container);

  // Resetar painel Pix
  const pixPanel = document.getElementById('pixPanel');
  if (pixPanel) pixPanel.classList.remove('visible');
}

// Expor globalmente
window.StripePayment = StripePayment;
window.PixPayment = PixPayment;
window.PaymentUI = PaymentUI;
window.copyPixCode = copyPixCode;
window.closePaymentModal = closePaymentModal;
window.openPaymentModal = openPaymentModal;

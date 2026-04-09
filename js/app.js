// ================================================================
// VendaFácil — js/app.js
// Lógica principal da landing page e modal de cadastro/login
// ================================================================

// ================================================================
// TOAST NOTIFICATIONS
// ================================================================

function showToast(msg, tipo = 'default') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast ' + tipo;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

window.showToast = showToast;

// ================================================================
// MODAL DE CADASTRO / LOGIN
// ================================================================

function openModal(tabInicial = 'cadastro') {
  const modal = document.getElementById('signupModal');
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  switchTab(tabInicial);
}

function closeModal() {
  const modal = document.getElementById('signupModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  clearFormErrors();
}

window.openModal = openModal;
window.closeModal = closeModal;

// Fechar ao clicar no overlay
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('signupModal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  }

  // Verificar sessão ao carregar
  checkAuthState();
});

// ================================================================
// TABS — Cadastro / Entrar
// ================================================================

function switchTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.modal-form-panel').forEach(el => {
    el.style.display = el.dataset.panel === tab ? 'block' : 'none';
  });
  clearFormErrors();
}

window.switchTab = switchTab;

// ================================================================
// CADASTRO
// ================================================================

async function handleSignup() {
  const nome = document.getElementById('signupNome')?.value?.trim();
  const email = document.getElementById('signupEmail')?.value?.trim();
  const whatsapp = document.getElementById('signupWhatsapp')?.value?.trim();
  const tipo_negocio = document.getElementById('signupTipoNegocio')?.value;
  const senha = document.getElementById('signupSenha')?.value;
  const btn = document.getElementById('btnSignup');

  clearFormErrors();

  if (!nome || !email || !senha) {
    showFormError('signup', 'Preencha todos os campos obrigatórios.');
    return;
  }

  if (senha.length < 6) {
    showFormError('signup', 'A senha deve ter pelo menos 6 caracteres.');
    return;
  }

  setLoading(btn, true, 'Criando conta...');

  try {
    // Verificar se Auth/supabase está disponível
    if (typeof Auth !== 'undefined' && Auth) {
      const { data, error } = await Auth.signUp({ nome, email, senha, whatsapp, tipo_negocio });

      if (error) {
        let msg = 'Erro ao criar conta. Tente novamente.';
        if (error.message.includes('already registered')) msg = 'Este e-mail já está cadastrado.';
        if (error.message.includes('invalid email')) msg = 'E-mail inválido.';
        showFormError('signup', msg);
        return;
      }

      showFormSuccess('signup', 'Conta criada! Verifique seu e-mail para confirmar.');
      setTimeout(() => {
        closeModal();
        window.location.href = '/pages/perfil.html';
      }, 2000);
    } else {
      // Demo mode - sem Supabase configurado
      showFormSuccess('signup', 'Demo: Configure o Supabase no .env para ativar o cadastro real.');
      setTimeout(closeModal, 2500);
    }
  } catch (e) {
    console.error('[Signup]', e);
    showFormError('signup', 'Erro inesperado. Tente novamente.');
  } finally {
    setLoading(btn, false, 'Criar minha conta grátis');
  }
}

window.handleSignup = handleSignup;

// ================================================================
// LOGIN
// ================================================================

async function handleLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const senha = document.getElementById('loginSenha')?.value;
  const btn = document.getElementById('btnLogin');

  clearFormErrors();

  if (!email || !senha) {
    showFormError('login', 'Preencha e-mail e senha.');
    return;
  }

  setLoading(btn, true, 'Entrando...');

  try {
    if (typeof Auth !== 'undefined' && Auth) {
      const { data, error } = await Auth.signIn({ email, senha });

      if (error) {
        let msg = 'E-mail ou senha incorretos.';
        if (error.message.includes('Email not confirmed')) msg = 'Confirme seu e-mail antes de entrar.';
        showFormError('login', msg);
        return;
      }

      showFormSuccess('login', 'Bem-vindo de volta!');
      setTimeout(() => {
        closeModal();
        window.location.href = '/pages/perfil.html';
      }, 1000);
    } else {
      showFormError('login', 'Supabase não configurado. Verifique o arquivo .env.');
    }
  } catch (e) {
    console.error('[Login]', e);
    showFormError('login', 'Erro inesperado. Tente novamente.');
  } finally {
    setLoading(btn, false, 'Entrar');
  }
}

window.handleLogin = handleLogin;

// ================================================================
// LOGIN COM GOOGLE
// ================================================================

async function handleGoogleLogin() {
  if (typeof Auth !== 'undefined' && Auth) {
    await Auth.signInWithGoogle();
  } else {
    showToast('Configure o Supabase no .env para usar o login com Google.', 'error');
  }
}

window.handleGoogleLogin = handleGoogleLogin;

// ================================================================
// ESTADO DE AUTENTICAÇÃO — Atualiza nav
// ================================================================

async function checkAuthState() {
  if (typeof Auth === 'undefined') return;

  const session = await Auth.getSession();

  if (session) {
    // Usuário logado: mostrar avatar/perfil na nav
    const navActions = document.getElementById('navActions');
    if (navActions) {
      const user = session.user;
      const initials = (user.user_metadata?.nome || user.email || 'U')
        .split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2);

      navActions.innerHTML = `
        <a href="/pages/perfil.html" class="nav-avatar" title="Meu Perfil">${initials}</a>
        <a href="#" class="btn-nav" onclick="Auth.signOut(); return false;">Sair</a>
      `;
    }
  }

  // Listener para mudanças
  Auth.onAuthChange((event, session) => {
    if (event === 'SIGNED_IN') {
      setTimeout(checkAuthState, 100);
    } else if (event === 'SIGNED_OUT') {
      const navActions = document.getElementById('navActions');
      if (navActions) {
        navActions.innerHTML = `
          <a href="#" class="btn-nav" onclick="openModal(); return false;">Começar Grátis</a>
        `;
      }
    }
  });
}

// ================================================================
// FAQ ACCORDION
// ================================================================

function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

window.toggleFaq = toggleFaq;

// ================================================================
// HELPERS
// ================================================================

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = label;
}

function showFormError(ctx, msg) {
  const el = document.getElementById(`${ctx}Error`);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

function showFormSuccess(ctx, msg) {
  const el = document.getElementById(`${ctx}Success`);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

function clearFormErrors() {
  document.querySelectorAll('.form-error, .form-success').forEach(el => {
    el.classList.remove('visible');
  });
}

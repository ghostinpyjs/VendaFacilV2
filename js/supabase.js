// ================================================================
// VendaFácil — js/supabase.js
// Configuração e cliente Supabase
// ================================================================

// Importar do CDN (use no HTML via script type="module")
// ou via npm: import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = window.ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[VendaFácil] Supabase não configurado. Verifique o arquivo .env');
}

// Inicialização do cliente Supabase (CDN)
// Certifique-se de incluir no HTML:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabase = (typeof window.supabase !== 'undefined' && SUPABASE_URL)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ================================================================
// AUTH — Funções de autenticação
// ================================================================

const Auth = {

  /**
   * Cadastro com e-mail e senha
   */
  async signUp({ nome, email, senha, whatsapp, tipo_negocio }) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, whatsapp, tipo_negocio }
      }
    });

    if (error) return { error };

    // Criar perfil na tabela "profiles"
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        nome,
        email,
        whatsapp,
        tipo_negocio,
        plano: 'trial',
        trial_expira: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      });
    }

    return { data };
  },

  /**
   * Login com e-mail e senha
   */
  async signIn({ email, senha }) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    return { data, error };
  },

  /**
   * Login com Google OAuth
   * Redireciona para o fluxo OAuth do Google via Supabase
   */
  async signInWithGoogle() {
    if (!supabase) {
      alert('Supabase não configurado. Configure o arquivo .env para usar o login com Google.');
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/pages/auth-callback.html`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });

    if (error) {
      console.error('[Auth] Erro no login com Google:', error);
      showToast('Erro ao conectar com Google. Tente novamente.', 'error');
    }

    return { data, error };
  },

  /**
   * Logout
   */
  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = '/';
  },

  /**
   * Obter sessão atual
   */
  async getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  },

  /**
   * Obter usuário logado
   */
  async getUser() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  /**
   * Ouvir mudanças de autenticação
   */
  onAuthChange(callback) {
    if (!supabase) return;
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};

// ================================================================
// PROFILES — Perfil do usuário
// ================================================================

const Profiles = {

  async get(userId) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) console.error('[Profiles] Erro ao buscar perfil:', error);
    return data;
  },

  async update(userId, updates) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    return { data, error };
  },

  async updatePassword(novaSenha) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    const { data, error } = await supabase.auth.updateUser({ password: novaSenha });
    return { data, error };
  }
};

// ================================================================
// SQL para criar tabelas no Supabase (execute no SQL Editor)
// ================================================================
/*

-- Tabela de perfis de usuário
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text,
  email text,
  whatsapp text,
  tipo_negocio text,
  plano text default 'trial',
  trial_expira timestamptz,
  avatar_url text,
  nome_negocio text,
  cnpj text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar RLS (Row Level Security)
alter table public.profiles enable row level security;

-- Políticas: usuário só acessa próprio perfil
create policy "Usuário vê seu próprio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Usuário atualiza seu próprio perfil"
  on profiles for update using (auth.uid() = id);

create policy "Usuário insere seu próprio perfil"
  on profiles for insert with check (auth.uid() = id);

-- Trigger para criar perfil automaticamente após cadastro
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

*/

export { supabase, Auth, Profiles };

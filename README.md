# VendaFácil — Guia de Configuração

## Estrutura de Arquivos

```
vendafacil/
├── index.html              ← Landing page principal
├── .env                    ← Configurações (NUNCA comitar no Git)
├── css/
│   └── styles.css          ← Todos os estilos
├── js/
│   ├── app.js              ← Lógica da landing page (modal, FAQ, auth UI)
│   ├── supabase.js         ← Cliente Supabase + funções de Auth e Perfil
│   └── payments.js         ← Stripe + Pix/IMAP
└── pages/
    ├── perfil.html         ← Página de perfil do usuário
    └── auth-callback.html  ← Callback do Google OAuth
```

---

## Configuração Passo a Passo

### 1. Supabase (Banco de Dados + Auth)

1. Crie um projeto em https://app.supabase.com
2. Vá em **Settings > API** e copie a URL e a chave anônima
3. Preencha no `.env`:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhb...
   ```
4. Execute o SQL de criação de tabelas (está comentado em `js/supabase.js`)

### 2. Login com Google (OAuth)

1. Acesse https://console.cloud.google.com
2. Crie um projeto e vá em **APIs & Services > Credentials > OAuth 2.0**
3. Adicione como URI de redirecionamento autorizado:
   ```
   https://SEU_PROJETO.supabase.co/auth/v1/callback
   ```
4. No Supabase: vá em **Authentication > Providers > Google** e ative
5. Cole o Client ID e Client Secret do Google no Supabase
6. Preencha no `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   ```

### 3. Stripe (Cartão de Crédito)

1. Crie uma conta em https://stripe.com
2. Vá em **Developers > API Keys**
3. Preencha no `.env`:
   ```
   STRIPE_PUBLIC_KEY=pk_test_xxxxx
   STRIPE_SECRET_KEY=sk_test_xxxxx
   ```
4. Altere `stripe_enabled: true` no bloco `window.PAYMENT_CONFIG` do `index.html`
5. Crie um endpoint de backend `/api/payments/stripe/create-checkout` (Edge Function no Supabase recomendado)

### 4. Pix via IMAP (Confirmação automática)

O sistema monitora o e-mail do seu banco por notificações de Pix recebido.

1. Configure o e-mail bancário que recebe avisos de Pix
2. Preencha no `.env`:
   ```
   IMAP_HOST=imap.seubanco.com.br
   IMAP_PORT=993
   IMAP_USER=seu_email@banco.com.br
   IMAP_PASSWORD=sua_senha
   IMAP_PIX_SUBJECT_FILTER=Pix recebido
   PIX_CHAVE=81991610473
   ```
3. Altere `pix_enabled: true` no bloco `window.PAYMENT_CONFIG` do `index.html`
4. Implemente o endpoint `/api/payments/pix/status` no backend para verificar via IMAP

**Bancos compatíveis (IMAP):**
| Banco | Host IMAP |
|-------|-----------|
| Itaú | imap.itau.com.br |
| Bradesco | imap.bradesco.com.br |
| Nubank | imap.nubank.com.br |
| Sicredi | imap.sicredi.com.br |
| Banco do Brasil | imap.bb.com.br |

> **Nota:** O "Pagar com Pix" aparece para o usuário. O IMAP é somente backend para confirmar o pagamento automaticamente.

---

## Comportamento dos Pagamentos

| Configuração | Exibição para o usuário |
|---|---|
| `pix_enabled: true` | "Pagar com Pix" — Disponível |
| `pix_enabled: false` | "Pagar com Pix" — Indisponível |
| `stripe_enabled: true` | "Cartão de Crédito" — Disponível |
| `stripe_enabled: false` | "Cartão de Crédito" — Indisponível |

---

## Injeção de Config no Frontend (Produção)

Em produção, **não coloque as chaves diretamente no HTML**. Use um servidor para gerar um bloco seguro:

**Node.js / Express:**
```js
app.get('/env-config.js', (req, res) => {
  res.send(`
    window.ENV = {
      SUPABASE_URL: "${process.env.SUPABASE_URL}",
      SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY}"
    };
    window.PAYMENT_CONFIG = {
      stripe_enabled: ${!!process.env.STRIPE_PUBLIC_KEY},
      pix_enabled: ${!!process.env.IMAP_HOST},
      pix_chave: "${process.env.PIX_CHAVE}",
      pix_beneficiario: "${process.env.PIX_BENEFICIARIO}",
      pix_cidade: "${process.env.PIX_CIDADE}",
      stripe_public_key: "${process.env.STRIPE_PUBLIC_KEY || ''}"
    };
  `);
});
```

---

## Contato de Suporte

WhatsApp: [(81) 991610473](https://wa.me/5581991610473)

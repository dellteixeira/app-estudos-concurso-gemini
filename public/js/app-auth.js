// V10.64.67 — autenticação crítica desacoplada de app-ai.js.
// Este arquivo deve carregar depois de app-core.js e antes de app-pwa.js.

async function checkAuthAndSync() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        const session = data?.session || null;
        if (session?.user) {
            currentUser = session.user;
            prepareAuthenticatedUserContext(currentUser);
            checkSuperUserStatus();
            showDashboard();
        } else {
            showCleanAuthScreen();
        }
    } catch (error) {
        console.warn('Falha ao recuperar sessão inicial:', error);
        showCleanAuthScreen('Não foi possível restaurar a sessão. Entre novamente.');
    }
}

function getAuthFieldValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

function describeAuthError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
        return 'E-mail ou senha incorretos.';
    }
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
        return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
    }
    if (code === 'weak_password' || /weak password/i.test(message)) {
        return 'Sua senha precisa ser atualizada por segurança. Use “Esqueci minha senha”.';
    }
    if (code === 'over_request_rate_limit' || /rate limit/i.test(message)) {
        return 'Muitas tentativas em sequência. Tente novamente em alguns minutos.';
    }
    return message || 'Não foi possível autenticar sua conta.';
}

async function handleLogin() {
    const email = getAuthFieldValue('email').toLowerCase();
    const password = getAuthFieldValue('password');
    if (!email || !password) return appNotice('Preencha e-mail e senha.', { title:'Entrar' });

    const button = document.querySelector('[data-action="auth-login"]');
    if (button) button.disabled = true;
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error('O Supabase não retornou um usuário autenticado.');
        currentUser = data.user;
        prepareAuthenticatedUserContext(currentUser);
        checkSuperUserStatus();
        showDashboard();
    } catch (error) {
        showCleanAuthScreen(describeAuthError(error));
        const emailField = document.getElementById('email');
        if (emailField) emailField.value = email;
    } finally {
        if (button) button.disabled = false;
    }
}

async function handleSignUp() {
    const email = getAuthFieldValue('email').toLowerCase();
    const password = getAuthFieldValue('password');
    if (!email || !password) return appNotice('Preencha e-mail e senha.', { title:'Cadastrar' });
    if (password.length < 8) return appNotice('Use uma senha com pelo menos 8 caracteres.', { title:'Senha muito curta' });

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;

        if (data?.session?.user) {
            currentUser = data.session.user;
            prepareAuthenticatedUserContext(currentUser);
            checkSuperUserStatus();
            showDashboard();
            return appNotice('Conta criada e conectada com sucesso.', { title:'Bem-vindo' });
        }
        return appNotice('Cadastro realizado. Verifique seu e-mail para confirmar a conta e depois entre no Painel.', { title:'Confirme seu e-mail' });
    } catch (error) {
        return appNotice(describeAuthError(error), { title:'Não foi possível cadastrar' });
    }
}

async function handleForgotPassword() {
    const email = getAuthFieldValue('email').toLowerCase();
    if (!email) return appNotice('Informe seu e-mail no campo acima para redefinir a senha.', { title:'Redefinir senha' });

    const redirectTo = window.location.origin + window.location.pathname;
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        await appNotice('Enviamos um link de redefinição para o seu e-mail. Abra o link neste dispositivo e escolha uma nova senha.', { title:'Verifique seu e-mail' });
    } catch (error) {
        await appNotice(describeAuthError(error), { title:'Não foi possível enviar a redefinição' });
    }
}

async function completePasswordRecovery() {
    const first = await appPrompt({
        title:'Nova senha',
        label:'Digite sua nova senha',
        help:'Use pelo menos 8 caracteres.',
        confirmText:'Continuar',
        inputType:'password',
        maxLength:128
    });
    if (first === null) return;
    const password = String(first || '');
    if (password.length < 8) {
        await appNotice('A nova senha deve ter pelo menos 8 caracteres.', { title:'Senha muito curta' });
        return completePasswordRecovery();
    }

    const second = await appPrompt({
        title:'Confirmar nova senha',
        label:'Digite novamente a nova senha',
        confirmText:'Alterar senha',
        inputType:'password',
        maxLength:128
    });
    if (second === null) return;
    if (String(second) !== password) {
        await appNotice('As senhas não coincidem.', { title:'Confirmação diferente' });
        return completePasswordRecovery();
    }

    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
        await appNotice(describeAuthError(error), { title:'Não foi possível alterar a senha' });
        return;
    }
    await appNotice('Senha atualizada com sucesso. Sua sessão já está autenticada.', { title:'Senha alterada' });
}

function clearSupabaseAuthStorage() {
    try {
        const projectRef = (() => {
            try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (_) { return ''; }
        })();
        const remove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if ((projectRef && key === `sb-${projectRef}-auth-token`) || key === 'supabase.auth.token') remove.push(key);
        }
        remove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
        console.warn('Limpeza local da sessão Supabase:', error);
    }
}

function showCleanAuthScreen(message = '') {
    currentUser = null;
    isSuperUser = false;
    activeUserContextId = null;
    userContextGeneration += 1;
    dashboardLoadPromise = null;
    syncPromise = null;
    syncUiMode = 'idle';
    resetInMemoryUserState();
    currentConcurso = 'Concurso Geral';
    metadataCache = {};
    backupRestoreInProgress = false;

    const dashboard = document.getElementById('app-dashboard');
    const auth = document.getElementById('auth-screen');
    if (dashboard) dashboard.style.display = 'none';
    if (auth) auth.style.display = 'flex';

    const password = document.getElementById('password');
    if (password) password.value = '';
    const status = document.getElementById('authStatusMessage');
    if (status) {
        status.textContent = message || '';
        status.classList.toggle('is-error', Boolean(message));
        setVisualState(status, Boolean(message));
    }
}

async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut({ scope:'local' });
        if (error) throw error;
    } catch (error) {
        console.warn('Falha no signOut; limpando sessão local:', error);
    }
    showCleanAuthScreen();
    clearSupabaseAuthStorage();
}

function checkSuperUserStatus() {
    const appRole = currentUser?.app_metadata?.role || '';
    isSuperUser = appRole === 'super_user' || appRole === 'admin';
    const badge = document.getElementById('superUserBadge');
    setVisualState(badge, isSuperUser);
}

function showDashboard() {
    const auth = document.getElementById('auth-screen');
    const dashboard = document.getElementById('app-dashboard');
    if (auth) auth.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    updateOnlineStatusBannerOnly();
    updateSyncIndicator();
    if (dashboardLoadPromise) return;
    dashboardLoadPromise = loadData().catch(error => {
        console.error('Falha ao carregar o painel:', error);
        appNotice('O painel foi aberto com os dados locais. A sincronização será tentada novamente.', { title:'Sincronização pendente' });
    }).finally(() => { dashboardLoadPromise = null; });
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        currentUser = session?.user || currentUser;
        if (currentUser) prepareAuthenticatedUserContext(currentUser);
        queueMicrotask(() => completePasswordRecovery().catch(error => console.warn('Falha na recuperação de senha:', error)));
        return;
    }

    if (session?.user) {
        currentUser = session.user;
        prepareAuthenticatedUserContext(currentUser);
        checkSuperUserStatus();
        showDashboard();
        return;
    }

    if (event === 'SIGNED_OUT' || !session) showCleanAuthScreen();
});

document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndSync();
}, { once:true });

window.handleLogin = handleLogin;
window.handleSignUp = handleSignUp;
window.handleLogout = handleLogout;
window.handleForgotPassword = handleForgotPassword;

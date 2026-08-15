import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function getDefaultKey(jsonEnvName: string, legacyEnvName: string): string {
  const modern = Deno.env.get(jsonEnvName)
  if (modern) {
    try {
      const parsed = JSON.parse(modern)
      if (typeof parsed?.default === 'string' && parsed.default) return parsed.default
    } catch (_) {
      // Fallback para chave legada abaixo.
    }
  }
  return Deno.env.get(legacyEnvName) || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const publishableKey = getDefaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const secretKey = getDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization') || ''

  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error('delete-account: ambiente Supabase incompleto')
    return json({ error: 'Configuração interna da função indisponível.' }, 500)
  }
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Sessão ausente.' }, 401)
  }

  // Cliente do usuário: preserva o JWT da chamada e respeita RLS.
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const token = authorization.slice(7).trim()
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  const user = userData?.user
  if (userError || !user?.id) {
    console.warn('delete-account: sessão inválida', userError?.message || '')
    return json({ error: 'Sessão inválida ou expirada.' }, 401)
  }

  try {
    // A RPC é SECURITY INVOKER e usa auth.uid(); portanto só apaga dados
    // pertencentes ao próprio usuário autenticado e executa tudo em uma transação.
    const { data: deletedData, error: deleteDataError } = await userClient.rpc('delete_my_study_data')
    if (deleteDataError) {
      console.error('delete-account: falha ao apagar dados', deleteDataError)
      return json({
        error: 'Não foi possível excluir os dados da conta antes de remover o login.',
        code: 'ACCOUNT_DATA_DELETE_FAILED',
      }, 500)
    }

    // Cliente administrativo existe somente dentro da Edge Function. As Edge
    // Functions hospedadas recebem SUPABASE_SECRET_KEYS / SERVICE_ROLE por padrão.
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id, false)
    if (deleteUserError) {
      console.error('delete-account: falha ao apagar auth.users', deleteUserError)
      return json({
        error: 'Os dados foram removidos, mas o login não pôde ser excluído. Tente novamente.',
        code: 'AUTH_USER_DELETE_FAILED',
      }, 502)
    }

    return json({ deleted: true, userId: user.id, data: deletedData })
  } catch (error) {
    console.error('delete-account: erro inesperado', error)
    return json({ error: 'Falha interna ao excluir a conta.' }, 500)
  }
})

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


async function removeStoragePrefix(adminClient: ReturnType<typeof createClient>, bucket: string, prefix: string) {
  const removeBatch: string[] = []

  async function walk(currentPrefix: string) {
    let offset = 0
    const limit = 1000
    while (true) {
      const { data, error } = await adminClient.storage.from(bucket).list(currentPrefix, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        const message = String(error.message || '')
        // Bucket futuro ainda não criado: não transforma exclusão de conta atual em erro.
        if (/bucket.*not found|not found/i.test(message)) return
        throw error
      }
      const entries = Array.isArray(data) ? data : []
      for (const entry of entries) {
        if (!entry?.name) continue
        const fullPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name
        if (entry.id) removeBatch.push(fullPath)
        else await walk(fullPath)
      }
      if (entries.length < limit) break
      offset += limit
    }
  }

  await walk(prefix)
  for (let i = 0; i < removeBatch.length; i += 100) {
    const { error } = await adminClient.storage.from(bucket).remove(removeBatch.slice(i, i + 100))
    if (error) throw error
  }
  return removeBatch.length
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
    // Cliente administrativo existe somente dentro da Edge Function. Ele também
    // remove objetos privados que pertençam ao usuário antes da remoção de auth.users.
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let deletedStorageObjects = 0
    try {
      deletedStorageObjects += await removeStoragePrefix(adminClient, 'study-pdfs', user.id)
    } catch (storageError) {
      console.error('delete-account: falha ao apagar Storage do usuário', storageError)
      return json({
        error: 'Não foi possível excluir os arquivos privados da conta.',
        code: 'ACCOUNT_STORAGE_DELETE_FAILED',
      }, 500)
    }

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

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id, false)
    if (deleteUserError) {
      console.error('delete-account: falha ao apagar auth.users', deleteUserError)
      return json({
        error: 'Os dados foram removidos, mas o login não pôde ser excluído. Tente novamente.',
        code: 'AUTH_USER_DELETE_FAILED',
      }, 502)
    }

    return json({ deleted: true, userId: user.id, data: deletedData, deletedStorageObjects })
  } catch (error) {
    console.error('delete-account: erro inesperado', error)
    return json({ error: 'Falha interna ao excluir a conta.' }, 500)
  }
})

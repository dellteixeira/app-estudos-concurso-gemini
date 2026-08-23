# Segurança dos backups de produção

A partir da Fase 1 da auditoria de segurança, o workflow `.github/workflows/backup-supabase.yml` não persiste mais dumps de produção em texto puro.

## Arquitetura

1. O runner gera `roles.sql`, `schema.sql`, `data.sql` e a cópia dos objetos do Supabase Storage apenas em armazenamento efêmero do job.
2. É gerado um manifesto SHA-256 dos arquivos do backup.
3. O conjunto é compactado temporariamente e criptografado com GnuPG em modo simétrico, AES-256 e derivação reforçada da chave.
4. O pacote em texto puro e a pasta `backups/` são apagados imediatamente após a criptografia.
5. O pacote `.gpg` e seu `.sha256` são enviados para um bucket privado do Cloudflare R2 quando os secrets de destino estiverem configurados.
6. Como contingência operacional, o GitHub Actions mantém por no máximo 7 dias apenas o pacote já criptografado e seu checksum. Nenhum `.sql` ou `.tar.gz` em texto puro pode ser publicado como artifact.

## Secrets obrigatórios

### Criptografia

- `BACKUP_ENCRYPTION_PASSPHRASE`: senha exclusiva para os backups, com no mínimo 24 caracteres. Não reutilizar senha de login, banco, Supabase ou Cloudflare.

### Cloudflare R2 privado

- `R2_BACKUP_ACCOUNT_ID`
- `R2_BACKUP_ACCESS_KEY_ID`
- `R2_BACKUP_SECRET_ACCESS_KEY`
- `R2_BACKUP_BUCKET`

As credenciais de R2 devem pertencer a um token dedicado ao bucket de backup, com somente as permissões mínimas necessárias para gravar e verificar objetos naquele bucket. O bucket deve permanecer privado.

## Restauração

Após baixar um arquivo `supabase-backup-*.tar.gz.gpg`, verifique primeiro o checksum:

```bash
sha256sum -c supabase-backup-*.tar.gz.gpg.sha256
```

Depois descriptografe localmente em ambiente controlado:

```bash
gpg --batch --decrypt --output supabase-backup.tar.gz supabase-backup-*.tar.gz.gpg
```

O GnuPG solicitará a senha de backup. A senha nunca deve ser gravada no repositório ou no pacote.

Extraia somente em um ambiente seguro e apague os arquivos em texto puro após concluir a restauração:

```bash
tar -xzf supabase-backup.tar.gz
```

## Regra operacional

Um backup só é considerado protegido quando o job termina sem detectar `.sql` ou `supabase-backup-*.tar.gz` residuais no workspace. Quando o R2 estiver configurado, o job também confirma o objeto remoto com `head-object` antes de concluir.

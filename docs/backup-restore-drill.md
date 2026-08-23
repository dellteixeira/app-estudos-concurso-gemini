# Backup Restore Readiness Drill

## Objetivo

O workflow `Backup Restore Readiness Drill` comprova periodicamente que o backup criptografado armazenado no Cloudflare R2 continua recuperável e íntegro sem restaurar dados no Supabase de produção.

Ele é executado manualmente por `workflow_dispatch` e, automaticamente, no primeiro dia de cada mês às 08:00 UTC.

## O que é validado

1. As credenciais do R2 e a passphrase de criptografia estão disponíveis ao workflow sem serem impressas nos logs.
2. O objeto `.tar.gz.gpg` mais recente sob o prefixo `supabase/` pode ser localizado e baixado.
3. O SHA-256 externo do arquivo criptografado coincide com o checksum persistido junto ao backup.
4. O arquivo pode ser descriptografado por GPG usando a passphrase configurada.
5. O `tar.gz` não contém caminhos absolutos, `..`, symlinks ou hardlinks antes da extração.
6. `roles.sql`, `schema.sql`, `data.sql`, `manifest.sha256` e `backup-info.txt` existem e são legíveis.
7. Os checksums do manifesto interno são verificados. Backups antigos que tenham incluído o próprio `manifest.sha256` são reconhecidos como legado; todos os demais arquivos continuam sendo verificados. Novos backups não geram mais manifesto autorreferente.
8. Todo material baixado, descriptografado e extraído é apagado do runner antes da publicação do artifact.

## O que o drill não faz

O workflow não recebe `SUPABASE_DB_URL`, não usa `SUPABASE_SERVICE_ROLE_KEY`, não executa `supabase db push`, `psql` nem qualquer comando de restauração contra produção. Portanto, ele é um teste de **recuperabilidade e integridade do backup**, não uma restauração destrutiva ou uma restauração completa em banco ativo.

Uma restauração integral deverá ser feita apenas em um banco descartável/isolado quando houver necessidade operacional específica.

## Evidência produzida

O único artifact persistido é `restore-drill-report.txt`, contendo metadados não secretos, a chave R2 do backup testado, resultado dos checksums, tamanhos dos dumps SQL, quantidade de objetos de Storage e o estado final do drill. Nenhum `.sql`, `.tar.gz`, `.gpg`, arquivo de Storage ou passphrase é enviado como artifact.

## Segredos utilizados

O workflow reutiliza os segredos já empregados pelo backup criptografado:

- `BACKUP_ENCRYPTION_PASSPHRASE`
- `R2_BACKUP_ACCOUNT_ID`
- `R2_BACKUP_ACCESS_KEY_ID`
- `R2_BACKUP_SECRET_ACCESS_KEY`
- `R2_BACKUP_BUCKET`

A perda da passphrase impede a recuperação dos backups existentes.

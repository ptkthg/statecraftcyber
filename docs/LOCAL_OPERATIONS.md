# Operação do Statecraft Cyber no Windows

O PostgreSQL 17 local armazena os dados da aplicação e os checkpoints do LangGraph em `127.0.0.1:5432/statecraft`. A publicação usa um snapshot versionado com os dados aprovados. A Vercel serve o snapshot da última publicação bem-sucedida mesmo quando o computador está desligado.

## Executar a rotina local

Abra o PowerShell na raiz do repositório com a conta do Windows que instalou o PostgreSQL e que já tem acesso ao projeto Vercel.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/run-local.ps1
```

Use `-CollectionOnly` para executar apenas a coleta local, por exemplo durante a preparação de uma publicação.

A rotina lê a credencial DPAPI de `D:\PostgreSQL\config\statecraft-credentials.xml` e fornece a URL local ao processo de coleta e ao exportador. Ela lê as chaves dos provedores em `.qa/.env.production` ou no ambiente do operador. Mantenha as chaves e os arquivos em `.qa` fora do Git. Os registros da execução ficam em `.qa/local-logs`.

O código de saída `0` indica sucesso ou que outra execução já está em andamento. O código `1` indica que a coleta teve falhas parciais e que o snapshot elegível foi publicado. O código `2` indica falha de configuração, acesso ao banco, exportação, publicação ou verificação. O código `3` indica falha do backup com publicação concluída.

Sem credenciais de IA, a coleta continua e o enriquecimento fica pendente. Falhas de fontes também podem produzir uma publicação parcial. Isso preserva as regras de evidência: rascunhos e indicadores ligados a análises não aprovadas ficam apenas no banco local.

O publicador usa o commit já registrado no Git e recusa alterações de código ainda não commitadas. Ele prepara uma pasta isolada, inclui apenas arquivos elegíveis e a cópia pública, cria uma versão candidata sem trocar o domínio, verifica o SHA-256 e as páginas e só então promove a versão. Se a verificação do domínio falhar após a troca, recupera a versão anterior. As publicações automáticas por push no Git foram desativadas em `vercel.json`; a rotina local passa a controlar a entrega dos dados.

O snapshot tem limite de 80 MB e precisa ter sido exportado nas últimas duas horas para ser publicado. Uma falha mantém a versão pública anterior; após três horas sem coleta ou publicação recente, o health fica degradado. O histórico privado e os backups nunca entram no pacote Vercel. O limite de tamanho é verificado antes do envio, sem apagar conteúdo do banco.

## Agendar e verificar

Após a primeira publicação verificada, instale a tarefa com a mesma conta do Windows. A tarefa roda a cada hora no minuto 17 e também um minuto após o logon. A política `IgnoreNew` e o bloqueio da rotina impedem sobreposição. O Agendador pode executar uma rodada perdida quando o computador voltar a ficar disponível com a sessão aberta.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/install-schedule.ps1
Get-ScheduledTaskInfo -TaskName 'Statecraft Cyber Local Publication'
Get-ChildItem .qa/local-logs | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

Use `Disable-ScheduledTask -TaskName 'Statecraft Cyber Local Publication'` para pausar as rodadas e `Enable-ScheduledTask -TaskName 'Statecraft Cyber Local Publication'` para retomá-las. O estado de coleta é acompanhado em `/api/health` por meio das datas de coleta e de publicação.

## Backup e recuperação

A rotina mantém até sete backups locais verificados em `.qa/local-backups`, com no máximo um backup automático por dia UTC. O arquivo só entra na rotação após o `pg_restore --list` confirmar o conteúdo da aplicação e dos checkpoints. Para gerar um backup manual imediatamente, execute o comando abaixo.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/backup-local.ps1
```

O arquivo de recuperação original permanece no diretório apontado por `.qa/latest-update-backup.txt`. Ele foi capturado em 21 de novembro de 2026 às 14:42:18 UTC. A verificação local fica em `.qa/local-restore-verification.json`. Dados produzidos na origem após esse horário dependem de uma nova coleta das fontes.

Em uma instalação nova com o banco local `statecraft` vazio, a sequência a seguir restaura o arquivo original, aplica as migrações posteriores e inicializa os checkpoints. O restore valida o SHA-256, recria o esquema histórico e insere os dados e o histórico Prisma em uma única transação. A comparação de contagens ocorre antes do commit. A presença de tabelas da aplicação bloqueia a restauração.

```powershell
$backupDirectory = (Get-Content .qa/latest-update-backup.txt -Raw).Trim()
$archive = Join-Path $backupDirectory 'database.json'
$checksum = '6104cf20204dc5e0025439142696df9b71b42703c1adc3697b898b3eaeb2a997'
& ./scripts/local/with-database.ps1 node scripts/local/restore-backup.mjs $archive $checksum
if ($LASTEXITCODE -ne 0) { throw 'A restauração falhou.' }
& ./scripts/local/with-database.ps1 ./node_modules/.bin/prisma.cmd migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'A migração falhou.' }
& ./scripts/local/with-database.ps1 npm.cmd run updates:setup
if ($LASTEXITCODE -ne 0) { throw 'A inicialização dos checkpoints falhou.' }
```

Para usar um backup local no formato `pg_dump`, valide a listagem com `D:\PostgreSQL\17\bin\pg_restore.exe --list <arquivo.dump>`. Restaure-o em um banco separado para inspecionar os dados antes de decidir por uma recuperação. Preserve o banco ativo e o arquivo original durante a inspeção.

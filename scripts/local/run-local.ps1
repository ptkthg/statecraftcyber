[CmdletBinding()]
param(
    [switch] $CollectionOnly,
    [string] $SourceEnvironmentFile,
    [string] $PostgresBin = 'D:\PostgreSQL\17\bin'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).ProviderPath
if (-not $SourceEnvironmentFile) { $SourceEnvironmentFile = Join-Path $repo '.qa\.env.production' }
$logDirectory = Join-Path $repo '.qa\local-logs'
$credentialKeys = @('ANTHROPIC_API_KEY', 'ABUSE_CH_AUTH_KEY', 'GROQ_API_KEY', 'NVD_API_KEY', 'OPENROUTER_API_KEY', 'OTX_API_KEY')
$collectionKeys = $credentialKeys + 'MAX_HOURLY_BRIEFINGS'
$scopedKeys = $collectionKeys + @('DATABASE_URL', 'STATECRAFT_DATA_SOURCE', 'AUTO_PUBLISH')
$savedEnvironment = @{}
foreach ($key in $scopedKeys) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = New-Object Threading.Mutex($false, "Global\StatecraftLocalPublication-$identity")
$acquired = $false
$transcript = $false
$inRepo = $false

try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        Write-Host 'Local publication is already running.'
        exit 0
    }

    Push-Location -LiteralPath $repo
    $inRepo = $true
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $log = Join-Path $logDirectory ('run-{0:yyyyMMddTHHmmssfffZ}.log' -f [DateTime]::UtcNow)
    Start-Transcript -LiteralPath $log | Out-Null
    $transcript = $true

    foreach ($key in $scopedKeys) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
    $env:AUTO_PUBLISH = 'true'

    if (Test-Path -LiteralPath $SourceEnvironmentFile) {
        $readEnvironment = @'
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const [, file, ...keys] = process.argv;
const environment = parseEnv(readFileSync(file, 'utf8'));
const usable = keys.flatMap((key) => {
  const value = environment[key];
  return value && !/^\[sensitive\]$/i.test(value.trim()) ? [[key, value]] : [];
});
process.stdout.write(JSON.stringify(Object.fromEntries(usable)));
'@
        $sourceJson = & node -e $readEnvironment $SourceEnvironmentFile @collectionKeys
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read the local source environment file.' }
        $sourceEnvironment = $sourceJson | ConvertFrom-Json
        Remove-Variable sourceJson
    }
    foreach ($key in $collectionKeys) {
        $value = if ($sourceEnvironment) { $sourceEnvironment.$key }
        if (-not $value) { $value = $savedEnvironment[$key] }
        if ($value -and $value.Trim() -ine '[Sensitive]') {
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
    Remove-Variable sourceEnvironment, value -ErrorAction SilentlyContinue

    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        & (Join-Path $PostgresBin 'pg_isready.exe') --host=127.0.0.1 --port=5432 --quiet --timeout=2
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 4
    }
    if (-not $ready) { throw 'Local PostgreSQL did not become ready.' }

    $withDatabase = Join-Path $PSScriptRoot 'with-database.ps1'
    try {
        Write-Host 'Running local collection.'
        & $withDatabase npm.cmd run updates:local
        $collectionExit = $LASTEXITCODE
    } finally {
        foreach ($key in ($collectionKeys + 'AUTO_PUBLISH')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
    }
    if ($collectionExit -notin @(0, 1)) { throw "Local collection could not run (exit $collectionExit)." }
    if ($CollectionOnly) { exit $collectionExit }
    if ($collectionExit -eq 1) { Write-Host 'Collection finished with partial source failures. Exporting eligible content.' }

    $backupExit = 0
    try {
        & (Join-Path $PSScriptRoot 'backup-local.ps1') -Daily -PostgresBin $PostgresBin
        $backupExit = $LASTEXITCODE
    } catch {
        $backupExit = 1
        Write-Warning "Local backup failed. $($_.Exception.Message)"
    }

    Write-Host 'Exporting the public snapshot.'
    & $withDatabase npm.cmd run publication:export
    if ($LASTEXITCODE -ne 0) { throw "Publication export failed (exit $LASTEXITCODE)." }

    Write-Host 'Deploying the verified public snapshot.'
    & npm.cmd run publication:deploy
    if ($LASTEXITCODE -ne 0) { throw "Publication deployment or verification failed (exit $LASTEXITCODE)." }
    if ($backupExit -ne 0) { exit 3 }
    exit $collectionExit
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 2
} finally {
    if ($transcript) { Stop-Transcript | Out-Null }
    foreach ($key in $scopedKeys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
    if ($inRepo) { Pop-Location }
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}

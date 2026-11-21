[CmdletBinding()]
param(
    [switch] $Daily,
    [ValidateRange(1, 365)]
    [int] $Keep = 7,
    [string] $PostgresBin = 'D:\PostgreSQL\17\bin',
    [string] $Directory
)

$ErrorActionPreference = 'Stop'
$now = [DateTime]::UtcNow
if (-not $Directory) { $Directory = Join-Path $PSScriptRoot '..\..\.qa\local-backups' }
New-Item -ItemType Directory -Path $Directory -Force | Out-Null
$Directory = (Resolve-Path -LiteralPath $Directory).ProviderPath
$namePattern = '^statecraft-local-\d{8}T\d{9}Z\.dump$'
$existing = Get-ChildItem -LiteralPath $Directory -File -Filter '*.dump' |
    Where-Object Name -Match $namePattern | Sort-Object Name -Descending
if ($Daily -and ($existing.Name -like ('statecraft-local-{0:yyyyMMdd}T*' -f $now))) {
    Write-Host 'A verified local backup already exists for today (UTC).'
    exit 0
}

$name = 'statecraft-local-{0:yyyyMMddTHHmmssfffZ}.dump' -f $now
$archive = Join-Path $Directory $name
$temporary = "$archive.partial"

try {
    & (Join-Path $PSScriptRoot 'with-database.ps1') -Command {
        $previousPassword = $env:PGPASSWORD
        try {
            $env:PGPASSWORD = [Uri]::UnescapeDataString(([Uri] $env:DATABASE_URL).UserInfo.Split(':', 2)[1])
            & (Join-Path $PostgresBin 'pg_dump.exe') --host=127.0.0.1 --port=5432 --username=statecraft --no-password --format=custom --no-owner --no-privileges "--file=$temporary" statecraft
        } finally {
            $env:PGPASSWORD = $previousPassword
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }

    $contents = & (Join-Path $PostgresBin 'pg_restore.exe') --list $temporary
    if ($LASTEXITCODE -ne 0 -or
        -not ($contents -match ' TABLE DATA public CveCache ') -or
        -not ($contents -match ' TABLE DATA statecraft_checkpoints checkpoints ')) {
        throw 'pg_restore did not verify the application and checkpoint data in the archive.'
    }
    $hash = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
    $bytes = (Get-Item -LiteralPath $temporary).Length
    Move-Item -LiteralPath $temporary -Destination $archive

    $obsolete = Get-ChildItem -LiteralPath $Directory -File -Filter '*.dump' |
        Where-Object Name -Match $namePattern | Sort-Object Name -Descending | Select-Object -Skip $Keep
    foreach ($file in $obsolete) {
        if ($file.DirectoryName -eq $Directory) {
            Remove-Item -LiteralPath $file.FullName
        }
    }
    Write-Host "Verified local backup $archive (bytes $bytes, SHA-256 $hash)."
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}

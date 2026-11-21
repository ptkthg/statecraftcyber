[CmdletBinding(DefaultParameterSetName = 'Executable')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Executable', Position = 0)]
    [string] $Executable,

    [Parameter(ParameterSetName = 'Executable', Position = 1, ValueFromRemainingArguments)]
    [string[]] $Arguments,

    [Parameter(Mandatory, ParameterSetName = 'ScriptBlock')]
    [scriptblock] $Command,

    [string] $CredentialFile = 'D:\PostgreSQL\config\statecraft-credentials.xml'
)

$ErrorActionPreference = 'Stop'
$previousUrl = $env:DATABASE_URL
try {
    try {
        $credential = Import-Clixml -LiteralPath $CredentialFile
        if ($credential -isnot [pscredential] -or $credential.UserName -cne 'statecraft') {
            throw 'Invalid application database credential.'
        }
        $password = [Uri]::EscapeDataString($credential.GetNetworkCredential().Password)
    } catch {
        throw 'Cannot load the local PostgreSQL credential. Run as the Windows user who created the DPAPI file.'
    }
    $env:DATABASE_URL = 'postgresql://statecraft:{0}@127.0.0.1:5432/statecraft' -f $password
    Remove-Variable password, credential
    $global:LASTEXITCODE = 0
    if ($PSCmdlet.ParameterSetName -eq 'ScriptBlock') {
        & $Command
    } else {
        & $Executable @Arguments
    }
    exit $global:LASTEXITCODE
} finally {
    $env:DATABASE_URL = $previousUrl
}

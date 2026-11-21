[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $TaskName = 'Statecraft Cyber Local Publication'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).ProviderPath
$runner = Join-Path $PSScriptRoot 'run-local.ps1'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$now = Get-Date
$nextRun = $now.Date.AddHours($now.Hour).AddMinutes(17)
if ($nextRun -le $now) { $nextRun = $nextRun.AddHours(1) }

$hourly = New-ScheduledTaskTrigger -Once -At $nextRun -RepetitionInterval (New-TimeSpan -Hours 1)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$logon.Delay = 'PT1M'
$hour = [TimeSpan]::FromHours(1)
if ([Xml.XmlConvert]::ToTimeSpan($hourly.Repetition.Interval) -ne $hour -or $hourly.Repetition.Duration) {
    throw 'The hourly trigger must repeat every hour without an end date.'
}
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argsForTask = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runner
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $argsForTask -WorkingDirectory $repo
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

if ($PSCmdlet.ShouldProcess($TaskName, 'Register the hourly and logon publication task')) {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($hourly, $logon) `
        -Principal $principal -Settings $settings -Description 'Collect and publish Statecraft Cyber from local PostgreSQL.' -Force |
        Out-Null
    $registered = Get-ScheduledTask -TaskName $TaskName -TaskPath '\'
    $registeredHourly = $registered.Triggers | Where-Object { $_.Repetition.Interval }
    $registeredLogon = $registered.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }
    if ($registered.Settings.MultipleInstances -ne 'IgnoreNew' -or
        -not $registered.Settings.StartWhenAvailable -or
        $registered.Principal.LogonType -ne 'Interactive' -or
        $registered.Triggers.Count -ne 2 -or
        -not $registeredHourly -or
        [Xml.XmlConvert]::ToTimeSpan($registeredHourly.Repetition.Interval) -ne $hour -or
        $registeredHourly.Repetition.Duration -or
        $registeredLogon.Delay -ne 'PT1M' -or
        $registered.Actions[0].Arguments -ne $argsForTask) {
        throw 'The registered task does not match the requested settings.'
    }
    $registered | Select-Object TaskName, State
    Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '\' | Select-Object NextRunTime, LastRunTime, LastTaskResult
}

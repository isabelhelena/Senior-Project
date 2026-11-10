param(
    [Parameter(Position = 0)]
    [ValidateSet('on', 'off', 'status', 'once')]
    [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$TaskName = 'LoneStarSupport-OfficialAlerts'

switch ($Action) {
    'on' {
        $Python = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe')).Path
        $Worker = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'worker.py')).Path
        $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $Run = New-ScheduledTaskAction -Execute $Python -Argument ('"{0}" --once' -f $Worker) -WorkingDirectory $PSScriptRoot
        $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Minutes 10)
        $Principal = New-ScheduledTaskPrincipal -UserId $Identity -LogonType Interactive -RunLevel Limited
        $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $TaskName -Action $Run -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'User-enabled official alert polling every ten minutes.' -Force | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Output 'Polling ON: refreshing now, then every ten minutes. Use polling.ps1 off to stop.'
    }
    'off' {
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
            Disable-ScheduledTask -TaskName $TaskName | Out-Null
            Stop-ScheduledTask -TaskName $TaskName
        }
        Write-Output 'Polling OFF.'
    }
    'once' {
        & (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') (Join-Path $PSScriptRoot 'worker.py') --once
        exit $LASTEXITCODE
    }
}

if ($Action -eq 'status') {
    $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (!$Task -or $Task.State -eq 'Disabled') {
        Write-Output 'Polling OFF.'
    } else {
        Write-Output "Polling ON ($($Task.State))."
    }
    if ($Task) {
        Get-ScheduledTaskInfo -TaskName $TaskName | Select-Object LastRunTime, LastTaskResult
    }
}

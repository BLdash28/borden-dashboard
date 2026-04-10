# setup-task-scheduler.ps1
# Registra el bot de Retail Link en Windows Task Scheduler
# para correr todos los días a las 5:00 AM.
#
# Ejecutar como Administrador:
#   Right-click → "Run with PowerShell" → Aceptar UAC

$TaskName   = "RetailLink-BL-Bot"
$ScriptDir  = "C:\Users\IAN\Documents\bl-dashboard"
$BatFile    = "$ScriptDir\scripts\run-retail-link.bat"
$LogFile    = "$ScriptDir\data\retail-link\bot.log"

# Crear carpeta de logs si no existe
New-Item -ItemType Directory -Force -Path "$ScriptDir\data\retail-link" | Out-Null

# Acción: correr el .bat
$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`" >> `"$LogFile`" 2>&1" `
    -WorkingDirectory $ScriptDir

# Trigger: todos los días a las 5:00 AM
$Trigger = New-ScheduledTaskTrigger -Daily -At "05:00AM"

# Configuración: correr aunque el usuario no esté logueado
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun

# Registrar (reemplaza si ya existe)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarea anterior eliminada."
}

Register-ScheduledTask `
    -TaskName   $TaskName `
    -Action     $Action `
    -Trigger    $Trigger `
    -Settings   $Settings `
    -RunLevel   Highest `
    -Force

Write-Host ""
Write-Host "✅  Tarea '$TaskName' registrada correctamente."
Write-Host "    Correrá todos los días a las 5:00 AM."
Write-Host ""
Write-Host "Para correr ahora manualmente:"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Para ver el estado:"
Write-Host "    Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host ""
Write-Host "Log en: $LogFile"

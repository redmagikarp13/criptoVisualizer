param(
    [string]$Executable = "$PSScriptRoot\..\src-tauri\target\release\criptovisualizer.exe",
    [ValidateRange(1, 60)][int]$Minutes = 15
)
$ErrorActionPreference = 'Stop'
$watch = [Diagnostics.Stopwatch]::StartNew()
$app = Start-Process -FilePath $Executable -PassThru
try {
    while ($watch.Elapsed.TotalSeconds -lt 30) {
        $app.Refresh()
        if ($app.HasExited) { throw 'O aplicativo encerrou antes de abrir a janela.' }
        if ($app.MainWindowHandle -ne 0) { break }
        Start-Sleep -Milliseconds 50
    }
    if ($app.MainWindowHandle -eq 0) { throw 'A janela nativa não apareceu em 30 segundos.' }
    $windowMs = $watch.ElapsedMilliseconds
    $known = [Collections.Generic.HashSet[int]]::new()
    [void]$known.Add($app.Id)
    $lastCpu = @{}
    $samples = [Collections.Generic.List[object]]::new()
    $elapsed = [Diagnostics.Stopwatch]::StartNew()
    $lastSampleSeconds = 0.0
    do {
        $app.Refresh()
        if ($app.HasExited) { throw 'O aplicativo encerrou durante a medição.' }
        $processes = @(Get-CimInstance Win32_Process -Filter "Name='criptovisualizer.exe' OR Name='msedgewebview2.exe'")
        do {
            $changed = $false
            foreach ($entry in $processes) {
                if ($known.Contains([int]$entry.ParentProcessId) -and $known.Add([int]$entry.ProcessId)) { $changed = $true }
            }
        } while ($changed)
        $privateBytes = 0L
        $workingBytes = 0L
        $cpuDelta = 0.0
        $count = 0
        foreach ($entry in $processes) {
            if (-not $known.Contains([int]$entry.ProcessId)) { continue }
            $process = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            $count++
            $privateBytes += $process.PrivateMemorySize64
            $workingBytes += $process.WorkingSet64
            $cpu = $process.TotalProcessorTime.TotalSeconds
            if ($lastCpu.ContainsKey($process.Id)) { $cpuDelta += [Math]::Max(0.0, $cpu - $lastCpu[$process.Id]) }
            $lastCpu[$process.Id] = $cpu
        }
        $seconds = $elapsed.Elapsed.TotalSeconds
        $cpuPercent = if ($samples.Count -gt 0) { 100 * $cpuDelta / ($seconds - $lastSampleSeconds) / [Environment]::ProcessorCount } else { 0 }
        $lastSampleSeconds = $seconds
        $sample = [pscustomobject]@{
            Seconds = [Math]::Round($seconds, 1)
            Processes = $count
            PrivateMiB = [Math]::Round($privateBytes / 1MB, 1)
            WorkingSetMiB = [Math]::Round($workingBytes / 1MB, 1)
            CpuPercentMachine = [Math]::Round($cpuPercent, 2)
        }
        $samples.Add($sample)
        $sample | ConvertTo-Json -Compress
        if ($seconds -ge $Minutes * 60) { break }
        Start-Sleep -Seconds ([Math]::Min(10, [Math]::Max(1, $Minutes * 60 - $seconds)))
    } while ($true)
    [pscustomobject]@{
        WindowCreatedMs = $windowMs
        DurationSeconds = [Math]::Round($elapsed.Elapsed.TotalSeconds, 1)
        Samples = $samples.Count
        PrivateMiBAverage = [Math]::Round(($samples | Measure-Object PrivateMiB -Average).Average, 1)
        PrivateMiBPeak = ($samples | Measure-Object PrivateMiB -Maximum).Maximum
        CpuPercentMachineAverage = [Math]::Round(($samples | Select-Object -Skip 1 | Measure-Object CpuPercentMachine -Average).Average, 2)
        CpuPercentMachinePeak = ($samples | Measure-Object CpuPercentMachine -Maximum).Maximum
        Notes = 'Inclui aplicativo e WebView2. CPU normalizada pela capacidade lógica total. Working set pode somar páginas compartilhadas. Janela criada não comprova primeiro gráfico renderizado. Nenhuma análise de IA foi solicitada.'
    } | ConvertTo-Json
} finally {
    $app.Refresh()
    if (-not $app.HasExited) { [void]$app.CloseMainWindow(); [void]$app.WaitForExit(10000) }
    $app.Dispose()
}

[CmdletBinding(SupportsShouldProcess=$true)]
param([switch]$ApproveSystemChanges)

$ErrorActionPreference='Stop'
$deployhubRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ((Get-Content -LiteralPath (Join-Path $deployhubRoot 'package.json') -Raw | ConvertFrom-Json).name -ne 'deployhub') { throw 'This helper must run from the DeployHub repository.' }
if (-not $ApproveSystemChanges) {
  Write-Host 'Review this script before running it with -ApproveSystemChanges in an administrator PowerShell.'
  Write-Host 'It installs WSL/Docker Desktop if needed, then enables isolated builds with Internet access for your own trusted projects.'
  Write-Host 'It preserves existing secrets and project data. It never restarts Windows automatically.'
  exit 1
}
if (-not $PSCmdlet.ShouldProcess('This Windows computer and the DeployHub .env','Configure WSL, Docker Desktop and private source deployments')) { exit 0 }
$deployhubAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $deployhubAdmin) { throw 'Open PowerShell as Administrator, then run this command again. No system changes have been made.' }

& wsl.exe --status *> $null
if ($LASTEXITCODE -ne 0) {
  & wsl.exe --install --no-distribution
  if ($LASTEXITCODE -notin @(0,3010)) { throw 'WSL setup did not finish. Complete Windows virtualization/WSL setup before continuing.' }
  Write-Host 'WSL installation was requested. If Windows requires a restart, restart manually and run this helper again.'
}

$deployhubDockerCandidates=@((Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'),(Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'))
$deployhubDockerCommand=Get-Command docker.exe -ErrorAction SilentlyContinue
$deployhubDockerPath=if($deployhubDockerCommand){$deployhubDockerCommand.Source}else{$deployhubDockerCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1}
if (-not $deployhubDockerPath) {
  $deployhubWinget=Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $deployhubWinget) { throw 'Windows App Installer (winget) is unavailable. Install Docker Desktop from https://docs.docker.com/desktop/setup/install/windows-install/ and run this helper again.' }
  & $deployhubWinget.Source install --id Docker.DockerDesktop --exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity
  if ($LASTEXITCODE -notin @(0,3010)) { throw 'Docker Desktop installation did not finish. Complete installation and run this helper again.' }
  $deployhubDockerPath=$deployhubDockerCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
}
if (-not $deployhubDockerPath) { throw 'Docker CLI was not found after installation. Complete Docker Desktop setup and reopen this terminal.' }
$deployhubDockerOS=& $deployhubDockerPath info --format '{{.OSType}}' 2>$null
if ($LASTEXITCODE -ne 0 -or $deployhubDockerOS.Trim() -ne 'linux') {
  Write-Host 'Open Docker Desktop, finish its initial setup and select Linux containers. Restart Windows manually if required.'
  Write-Host 'Once Docker reports that its engine is running, run this helper again. DeployHub has not been marked ready.'
  exit 2
}

$deployhubEnvPath=Join-Path $deployhubRoot '.env'
if (-not (Test-Path -LiteralPath $deployhubEnvPath)) { throw 'Run npm run setup before enabling source deployments.' }
$deployhubEnvironment=Get-Content -LiteralPath $deployhubEnvPath -Raw
$deployhubBackupDirectory=Join-Path $deployhubRoot 'data\config-backups'
New-Item -ItemType Directory -Path $deployhubBackupDirectory -Force | Out-Null
Copy-Item -LiteralPath $deployhubEnvPath -Destination (Join-Path $deployhubBackupDirectory ('.env.'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')+'.before-source'))
$deployhubSettings=[ordered]@{
  BUILD_DOCKER_ENABLED='true';RUNTIME_DOCKER_ENABLED='true';BUILD_NETWORK='bridge';
  RUNTIME_DOCKER_GATEWAY='host';RUNTIME_DOCKER_NETWORK='deployhub-runtime';
  RUNTIME_BUILD_IMAGE='node:22-bookworm';BUILD_MEMORY_MB='2048';DOCKER_BIN=$deployhubDockerPath.Replace('\','/')
}
foreach ($deployhubSetting in $deployhubSettings.GetEnumerator()) {
  $deployhubPattern='(?m)^'+[regex]::Escape($deployhubSetting.Key)+'=.*$'
  $deployhubLine=$deployhubSetting.Key+'='+$deployhubSetting.Value
  if([regex]::IsMatch($deployhubEnvironment,$deployhubPattern)){$deployhubEnvironment=[regex]::Replace($deployhubEnvironment,$deployhubPattern,[System.Text.RegularExpressions.MatchEvaluator]{param($match) $deployhubLine})}
  else{$deployhubEnvironment+=[Environment]::NewLine+$deployhubLine}
}
[IO.File]::WriteAllText($deployhubEnvPath,$deployhubEnvironment,[Text.UTF8Encoding]::new($false))
Write-Host 'Docker Linux engine is available. DeployHub source/runtime configuration is enabled; existing credentials and databases were preserved.'
Write-Host 'Restart DeployHub with npm run dev. Wait for the dashboard worker-readiness check, then use Retry as preview on the failed deployment.'
Write-Host 'Internet-enabled build containers are intended for your own trusted projects, not public untrusted tenants.'

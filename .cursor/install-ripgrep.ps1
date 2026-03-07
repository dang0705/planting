# Install ripgrep for Cursor Agent (required dependency)
# Run: powershell -ExecutionPolicy Bypass -File .cursor/install-ripgrep.ps1

$rgDir = "$env:LOCALAPPDATA\ripgrep"
$rgVersion = "15.1.0"
$rgZip = "ripgrep-$rgVersion-x86_64-pc-windows-msvc.zip"
$rgUrl = "https://github.com/BurntSushi/ripgrep/releases/download/$rgVersion/$rgZip"
$rgExtractPath = "$rgDir\ripgrep-$rgVersion-x86_64-pc-windows-msvc"

Write-Host "Installing ripgrep to $rgDir..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $rgDir | Out-Null
Invoke-WebRequest -Uri $rgUrl -OutFile "$rgDir\$rgZip" -UseBasicParsing
Expand-Archive -Path "$rgDir\$rgZip" -DestinationPath $rgDir -Force

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$rgExtractPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$rgExtractPath", "User")
    Write-Host "Added to user PATH. Restart terminal for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Already in PATH." -ForegroundColor Green
}

$env:PATH = "$rgExtractPath;$env:PATH"
& "$rgExtractPath\rg.exe" --version
Write-Host "`nDone! ripgrep is ready for Cursor Agent." -ForegroundColor Green

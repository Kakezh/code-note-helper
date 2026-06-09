param(
    [ValidateSet("dev", "prod")]
    [string]$Target = "dev",
    [string]$DevClientId = $env:CODE_NOTE_DEV_GOOGLE_CLIENT_ID,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $repoRoot "dist"
$targetRoot = Join-Path $distRoot $Target

$releaseClientId = "425918521606-6k5p5fj6nivrblrdtu0olbuek46qv5gu.apps.googleusercontent.com"
$currentDevClientId = "425918521606-hr2pm8tufp1u312frkostm2gtg71qniu.apps.googleusercontent.com"
if ($Target -eq "dev") {
    $devClientIdValue = $currentDevClientId
    if (-not [string]::IsNullOrWhiteSpace($DevClientId)) {
        $devClientIdValue = $DevClientId.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($devClientIdValue)) {
        throw "Dev build requires -DevClientId or CODE_NOTE_DEV_GOOGLE_CLIENT_ID. Do not edit root manifest.json manually."
    }
    if (-not $devClientIdValue.EndsWith(".apps.googleusercontent.com")) {
        throw "Dev OAuth Client ID must end with .apps.googleusercontent.com"
    }
    if ($devClientIdValue -eq $releaseClientId) {
        throw "Dev build must not use the release OAuth Client ID."
    }
    $targetClientId = $devClientIdValue
} else {
    $targetClientId = $releaseClientId
}

if ($Clean -and (Test-Path -LiteralPath $targetRoot)) {
    Remove-Item -LiteralPath $targetRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

$runtimeDirectories = @(
    "assets",
    "content",
    "icons",
    "notes",
    "options",
    "popup",
    "shared",
    "vendor"
)

$runtimeFiles = @(
    "manifest.json",
    "service-worker.js",
    "LICENSE"
)

foreach ($directory in $runtimeDirectories) {
    $source = Join-Path $repoRoot $directory
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination $targetRoot -Recurse -Force
    }
}

foreach ($file in $runtimeFiles) {
    $source = Join-Path $repoRoot $file
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination $targetRoot -Force
    }
}

$manifestPath = Join-Path $targetRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
if (-not $manifest.oauth2) {
    $manifest | Add-Member -MemberType NoteProperty -Name oauth2 -Value ([pscustomobject]@{})
}
$manifest.oauth2 | Add-Member -MemberType NoteProperty -Name client_id -Value $targetClientId -Force
$manifest.oauth2 | Add-Member -MemberType NoteProperty -Name scopes -Value @("https://www.googleapis.com/auth/drive.file") -Force
$manifest | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

if ($Target -eq "prod") {
    $oauthConfigPath = Join-Path $targetRoot "shared/problem-data/google-drive-oauth-config.js"
    if (Test-Path -LiteralPath $oauthConfigPath) {
        $oauthConfigText = Get-Content -LiteralPath $oauthConfigPath -Encoding UTF8 -Raw
        $oauthConfigText = $oauthConfigText.Replace("const CURRENT_DEV_EXTENSION_ID = 'dphinnngjhhgmabdjeecajealghipkbj';", "const CURRENT_DEV_EXTENSION_ID = '';")
        $oauthConfigText = $oauthConfigText.Replace("const LEGACY_DEV_EXTENSION_ID = 'nfcpikidobapnnnahapgpokkjnidemij';", "const LEGACY_DEV_EXTENSION_ID = '';")
        $oauthConfigText = $oauthConfigText.Replace("const CURRENT_DEV_CLIENT_ID = '425918521606-hr2pm8tufp1u312frkostm2gtg71qniu.apps.googleusercontent.com';", "const CURRENT_DEV_CLIENT_ID = '';")
        $oauthConfigText = $oauthConfigText.Replace("const LEGACY_DEV_CLIENT_ID = '425918521606-q9rto68s4maaapjfb4m9qgldtc87dd81.apps.googleusercontent.com';", "const LEGACY_DEV_CLIENT_ID = '';")
        Set-Content -LiteralPath $oauthConfigPath -Encoding UTF8 -Value $oauthConfigText
    }
}

$writtenManifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
if ($writtenManifest.oauth2.client_id -ne $targetClientId) {
    throw "manifest oauth2.client_id patch failed for target $Target"
}

Write-Host "Built $Target extension at $targetRoot"

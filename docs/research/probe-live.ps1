param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$coverageRoot = $PSScriptRoot
$coverageUrls = @(
  'https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit',
  'https://hypeddit.com/s11n28',
  'https://hypeddit.com/jgmzschranz/innahotjgmzschranzreworkfreedl',
  'https://hypeddit.com/6ldvuo',
  'https://hypeddit.com/qugar2',
  'https://hypeddit.com/email-take',
  'https://hypeddit.com/evagadd/presave',
  'https://hypeddit.com/vzck88',
  'https://hypeddit.com/makeme/restrictededit',
  'https://hypeddit.com/6bvcze',
  'https://hypeddit.com/857xli',
  'https://hypeddit.com/7meokt',
  'https://hypeddit.com/yussi/yussihigherfreedownload',
  'https://hypeddit.com/track/sc/WE1pIM5DlMkLd4xXbHLW',
  'https://hypeddit.com/bounceandbass/without-you',
  'https://hypeddit.com/track/09z1oz',
  'https://hypeddit.com/legacychill/hypnotized',
  'https://hypeddit.com/4yynp6',
  'https://hypeddit.com/track/omqdqa',
  'https://hypeddit.com/mwgjys'
)
if (Test-Path (Join-Path $coverageRoot 'chart-links.json')) {
  $coverageUrls += @(Get-Content -Raw (Join-Path $coverageRoot 'chart-links.json') | ConvertFrom-Json | Select-Object -First 8)
}

function Get-Attribute([string]$tag, [string]$name) {
  $pattern = '\b' + [regex]::Escape($name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)'')'
  $match = [regex]::Match($tag, $pattern, 'IgnoreCase')
  if ($match.Groups[1].Success) { return [Net.WebUtility]::HtmlDecode($match.Groups[1].Value) }
  if ($match.Groups[2].Success) { return [Net.WebUtility]::HtmlDecode($match.Groups[2].Value) }
  return ''
}

$seenGateIds = @{}
$results = [Collections.Generic.List[object]]::new()
$completedUrls=@{}
if ($Resume -and (Test-Path (Join-Path $coverageRoot 'live-results.json'))) {
  foreach($existing in (Get-Content -Raw (Join-Path $coverageRoot 'live-results.json') | ConvertFrom-Json)) {
    $results.Add($existing)
    $completedUrls[$existing.url]=$true
    if($existing.gateId) { $seenGateIds[$existing.gateId]=$true }
  }
}
foreach ($coverageUrl in $coverageUrls) {
  if($completedUrls.ContainsKey($coverageUrl)) { continue }
  $row = [ordered]@{ url=$coverageUrl; checkedAt=[DateTime]::UtcNow.ToString('o'); pageStatus=$null; gateId=$null; title=$null; steps=@(); unlimited=$null; publicFileStatus=$null; handshakeStatus=$null; skipStatus=$null; downloadStatus=$null; destinationPresent=$false; destinationAllowed=$false; classification='unclassified'; reason=$null }
  try {
    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $page = Invoke-WebRequest -Uri $coverageUrl -WebSession $session -TimeoutSec 20 -SkipHttpErrorCheck
    $row.pageStatus = [int]$page.StatusCode
    if ($page.StatusCode -ne 200) { $row.classification='page-unavailable'; $row.reason='Page did not return HTTP 200'; $results.Add($row); continue }
    $html=$page.Content
    $inputs=@{}
    foreach ($tag in [regex]::Matches($html,'<input\b[^>]*>','IgnoreCase')) {
      $id=Get-Attribute $tag.Value 'id'
      if ($id -and !$inputs.ContainsKey($id)) { $inputs[$id]=Get-Attribute $tag.Value 'value' }
    }
    $gateId=$inputs['current_download_file_listner']
    $row.title=[Net.WebUtility]::HtmlDecode(([regex]::Match($html,'(?s)<title>(.*?)</title>').Groups[1].Value.Trim()))
    if (!$gateId -or $gateId -notmatch '^[a-zA-Z0-9_-]{1,64}$') { $row.classification='not-download-gate'; $row.reason='No valid current_download_file_listner'; $results.Add($row); continue }
    $row.gateId=$gateId
    if ($seenGateIds.ContainsKey($gateId)) { $row.classification='duplicate-gate'; $row.reason='Already tested under another URL'; $results.Add($row); continue }
    $seenGateIds[$gateId]=$true
    $row.steps=@(($inputs['nwSteps'] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[a-zA-Z0-9_-]{1,32}$' } | Select-Object -Unique)
    $row.unlimited=$inputs['is_unlimited']
    $publicResponse=Invoke-WebRequest -Uri ('https://hypeddit-gates-prod.s3.amazonaws.com/'+$gateId+'_main') -Method Head -SkipHttpErrorCheck -TimeoutSec 12
    $row.publicFileStatus=[int]$publicResponse.StatusCode
    if ($publicResponse.StatusCode -eq 200) { $row.classification='public-file-accessible'; $row.destinationPresent=$true; $row.destinationAllowed=$true; $results.Add($row); continue }
    if ($inputs['is_unlimited'] -ne '1') { $row.classification='unsupported-layout'; $row.reason='Current provider only implements unlimited gate API'; $results.Add($row); continue }
    $csrfTag=[regex]::Matches($html,'<meta\b[^>]*>','IgnoreCase') | Where-Object { (Get-Attribute $_.Value 'name') -eq 'csrf-token' } | Select-Object -First 1
    $csrf=Get-Attribute $csrfTag.Value 'content'
    $headers=@{'X-CSRF-TOKEN'=$csrf;'X-Requested-With'='XMLHttpRequest';'Referer'=$coverageUrl}
    if ($inputs['gvt']) {
      $handshake=Invoke-WebRequest -Uri 'https://hypeddit.com/gate/ge' -Method Post -WebSession $session -Headers $headers -Body @{vt=$inputs['gvt'];uid=$gateId} -SkipHttpErrorCheck -TimeoutSec 12
      $row.handshakeStatus=[int]$handshake.StatusCode
    }
    $fields=[ordered]@{file=$gateId;wrndk=$inputs['wrndk'];download_action='DOWNLOAD';download_visit='true';profile_downloads='true';page='nonsingle';time='0';is_skippable='1';steps=($row.steps -join ',');gvf='0';lifetime_fan_spotify='0';lifetime_fan_deezer='0';lifetime_fan_apple='0'}
    $pairs=@($fields.GetEnumerator() | ForEach-Object { [uri]::EscapeDataString($_.Key)+'='+[uri]::EscapeDataString([string]$_.Value) })
    $pairs+=@($row.steps | ForEach-Object { 'skip_gate_steps%5B%5D='+[uri]::EscapeDataString($_) })
    $response=Invoke-WebRequest -Uri 'https://hypeddit.com/gate/download/ul' -Method Post -WebSession $session -Headers $headers -ContentType 'application/x-www-form-urlencoded;charset=UTF-8' -Body ($pairs -join '&') -SkipHttpErrorCheck -TimeoutSec 15
    $row.skipStatus=[int]$response.StatusCode
    if ($response.StatusCode -ne 200) { $row.classification='http-rejected'; $row.reason='Skip request HTTP status '+$response.StatusCode; $results.Add($row); continue }
    try {
      $data=$response.Content | ConvertFrom-Json
      $row.downloadStatus=$data.download_status
      $row.destinationPresent=[bool]($data.URL -and ([string]$data.URL).Trim())
      if ($row.destinationPresent) {
        $destination=[uri]::new([uri]$coverageUrl,[string]$data.URL)
        $row.destinationAllowed=$destination.Scheme -eq 'https' -and !$destination.UserInfo -and !$destination.Fragment -and (($destination.Host -eq 'hypeddit-gates-prod.s3.amazonaws.com' -and $destination.AbsolutePath -match '^/[a-zA-Z0-9_-]{1,64}_main$') -or ($destination.Host -in @('hypeddit.com','www.hypeddit.com') -and $destination.AbsolutePath -match '^/download/[a-zA-Z0-9_-]{1,256}/?$'))
      }
      if ($data.download_status -eq $true -and $row.destinationAllowed) { $row.classification='skip-request-resolved' }
      elseif ($data.download_status -eq $true -and !$row.destinationPresent) { $row.classification='empty-success-blocked' }
      elseif ($row.destinationPresent) { $row.classification='unrecognized-destination' }
      else { $row.classification='server-required'; $row.reason=if($null -ne $data.social_currency){'Server returned social_currency without destination'}else{'Server did not release a destination'} }
    } catch { $row.classification='invalid-response'; $row.reason='Response could not be parsed as expected JSON' }
  } catch {
    $row.classification='request-error'; $row.reason=$_.Exception.GetType().Name
  }
  $results.Add($row)
  $results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $coverageRoot 'live-results.json') -Encoding utf8
  Write-Output ($row.gateId+' '+$row.classification+' steps='+($row.steps -join ','))
}
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $coverageRoot 'live-results.json') -Encoding utf8
$results | Group-Object { $_.classification } | Select-Object Name,Count | Format-Table -AutoSize

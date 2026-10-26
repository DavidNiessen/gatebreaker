$ErrorActionPreference='Stop'
$sourceRows = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'live-results.json') | ConvertFrom-Json
$candidates = @($sourceRows | Where-Object classification -eq 'skip-request-resolved')
$verified = [Collections.Generic.List[object]]::new()
function Read-Attribute([string]$tag,[string]$name) {
  $match=[regex]::Match($tag,('\b'+[regex]::Escape($name)+'\s*=\s*(?:"([^"]*)"|''([^'']*)'')'),'IgnoreCase')
  if($match.Groups[1].Success){return [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)}
  if($match.Groups[2].Success){return [Net.WebUtility]::HtmlDecode($match.Groups[2].Value)}
  return ''
}
foreach($candidate in $candidates) {
  $row=[ordered]@{url=$candidate.url;gateId=$candidate.gateId;checkedAt=[DateTime]::UtcNow.ToString('o');resolutionRepeated=$false;destinationPresent=$false;fileStatus=$null;contentType=$null;contentRange=$null;retainedBytes=0;classification='unverified';reason=$null}
  try {
    $session=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $page=Invoke-WebRequest -Uri $candidate.url -WebSession $session -TimeoutSec 20
    $inputs=@{}
    foreach($tag in [regex]::Matches($page.Content,'<input\b[^>]*>','IgnoreCase')) {
      $id=Read-Attribute $tag.Value 'id'
      if($id -and !$inputs.ContainsKey($id)){$inputs[$id]=Read-Attribute $tag.Value 'value'}
    }
    $csrfTag=[regex]::Matches($page.Content,'<meta\b[^>]*>','IgnoreCase') | Where-Object {(Read-Attribute $_.Value 'name') -eq 'csrf-token'} | Select-Object -First 1
    $headers=@{'X-CSRF-TOKEN'=(Read-Attribute $csrfTag.Value 'content');'X-Requested-With'='XMLHttpRequest';'Referer'=$candidate.url}
    if($inputs['gvt']){$null=Invoke-WebRequest -Uri 'https://hypeddit.com/gate/ge' -Method Post -WebSession $session -Headers $headers -Body @{vt=$inputs['gvt'];uid=$candidate.gateId} -TimeoutSec 12}
    $fields=[ordered]@{file=$candidate.gateId;wrndk=$inputs['wrndk'];download_action='DOWNLOAD';download_visit='true';profile_downloads='true';page='nonsingle';time='0';is_skippable='1';steps=($candidate.steps -join ',');gvf='0';lifetime_fan_spotify='0';lifetime_fan_deezer='0';lifetime_fan_apple='0'}
    $pairs=@($fields.GetEnumerator() | ForEach-Object {[uri]::EscapeDataString($_.Key)+'='+[uri]::EscapeDataString([string]$_.Value)})
    $pairs+=@($candidate.steps | ForEach-Object {'skip_gate_steps%5B%5D='+[uri]::EscapeDataString($_)})
    $response=Invoke-WebRequest -Uri 'https://hypeddit.com/gate/download/ul' -Method Post -WebSession $session -Headers $headers -ContentType 'application/x-www-form-urlencoded;charset=UTF-8' -Body ($pairs -join '&') -TimeoutSec 15
    $row.resolutionRepeated=$true
    $data=$response.Content | ConvertFrom-Json
    $row.destinationPresent=[bool]($data.download_status -eq $true -and $data.URL)
    if(!$row.destinationPresent){$row.classification='no-longer-resolved';$verified.Add($row);continue}
    $destination=[uri]::new([uri]$candidate.url,[string]$data.URL)
    if($destination.Scheme -ne 'https' -or $destination.Host -ne 'hypeddit-gates-prod.s3.amazonaws.com' -or $destination.AbsolutePath -notmatch '^/[a-zA-Z0-9_-]{1,64}_main$'){$row.classification='destination-not-direct-s3';$verified.Add($row);continue}
    $handler=[Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect=$false
    $handler.UseCookies=$false
    $client=[Net.Http.HttpClient]::new($handler)
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get,$destination)
    $request.Headers.Range=[Net.Http.Headers.RangeHeaderValue]::new(0,0)
    $cancel=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(15))
    $fileResponse=$null
    try {
      $fileResponse=$client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancel.Token).GetAwaiter().GetResult()
      $row.fileStatus=[int]$fileResponse.StatusCode
      $row.contentType=[string]$fileResponse.Content.Headers.ContentType
      $row.contentRange=[string]$fileResponse.Content.Headers.ContentRange
      if($row.fileStatus -in @(200,206)) {
        $stream=$fileResponse.Content.ReadAsStreamAsync($cancel.Token).GetAwaiter().GetResult()
        try {$oneByte=[byte[]]::new(1);$row.retainedBytes=$stream.ReadAsync($oneByte,0,1,$cancel.Token).GetAwaiter().GetResult()} finally {$cancel.Cancel();$stream.Dispose()}
        $row.classification=if($row.retainedBytes -eq 1 -and $row.contentType -notmatch 'text/html|xml'){'file-access-verified'}else{'unexpected-file-response'}
      } else {$row.classification='file-http-rejected'}
    } finally {
      $cancel.Cancel()
      if($fileResponse){$fileResponse.Dispose()}
      $request.Dispose();$client.Dispose();$handler.Dispose();$cancel.Dispose()
    }
  } catch {$row.classification='verification-error';$row.reason=$_.Exception.GetType().Name}
  $verified.Add($row)
  $verified | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verified-files.json') -Encoding utf8
  Write-Output ($row.gateId+' '+$row.classification+' status='+$row.fileStatus+' retained='+$row.retainedBytes)
}
$verified | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verified-files.json') -Encoding utf8

param([string]$BaseUrl = 'http://localhost:8080', [string]$Log = 'http-verification.log')
$ErrorActionPreference = 'Stop'
Start-Transcript -Path $Log -Force | Out-Null
try {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  function Call($Method, $Path, $Body, $Expected, $Headers = @{}, $ContentType = 'application/json') {
    try { $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method $Method -WebSession $session -Headers $Headers -ContentType $ContentType -Body $Body -SkipHttpErrorCheck } catch { throw "Request $Method $Path failed: $_" }
    if ([int]$r.StatusCode -ne $Expected) { throw "$Method $Path expected $Expected, got $($r.StatusCode): $($r.Content)" }
    Write-Host "$Method $Path -> $($r.StatusCode) $($r.Content)"
    if ($r.Content) { return ($r.Content | ConvertFrom-Json) }
  }
  function Csrf { $c = Call GET '/api/auth/csrf' $null 200; return @{ $c.headerName = $c.token } }
  $health = Call GET '/api/health' $null 200
  $ready = Call GET '/api/ready' $null 200
  if ($health.status -ne 'UP' -or $ready.status -ne 'UP' -or $ready.forecast_rows -ne 155) { throw 'Health or readiness mismatch' }
  $catalog = Call GET '/api/catalog' $null 200
  if (-not $catalog.routes) { throw 'Empty catalog' }
  $h = Csrf
  $calc = Call POST '/api/calculate' '{"route":"MOW-AER","date":"2026-06-01","price":9000}' 200 $h
  if ($calc.base_demand -ne 854 -or $calc.demand -ne 854 -or $calc.sales -ne 854 -or $calc.seats -ne 900) { throw 'Calculation mismatch' }
  foreach ($bad in @('{"route":"MOW-AER","date":"2026-06-01","price":"9000"}','{"route":"MOW-AER","date":"2026-06-01","price":true}','{"route":"MOW-AER","date":"2026-02-30","price":9000}','{"route":"MOW-AER","date":"2026-06-01"}')) { $null = Call POST '/api/calculate' $bad 400 $h }
  $null = Call GET '/api/account/report' $null 401
  $name = 'qa' + [guid]::NewGuid().ToString('N').Substring(0,12)
  $password = 'QaPassword123!'
  $body = @{username=$name;password=$password} | ConvertTo-Json -Compress
  $null = Call POST '/api/auth/register' $body 201 $h
  $null = Call POST '/api/auth/register' $body 409 $h
  $null = Call GET '/api/auth/me' $null 401
  $form = 'username=' + [uri]::EscapeDataString($name) + '&password=' + [uri]::EscapeDataString($password)
  $null = Call POST '/api/auth/login' $form 200 $h 'application/x-www-form-urlencoded'
  $h = Csrf
  $me = Call GET '/api/auth/me' $null 200
  if ($me.username -ne $name) { throw 'Wrong session user' }
  $null = Call GET '/api/account/report' $null 200
  $null = Call POST '/api/auth/logout' '' 200 $h
  $null = Call GET '/api/auth/me' $null 401
  Write-Host 'PASS'
} finally { Stop-Transcript | Out-Null }

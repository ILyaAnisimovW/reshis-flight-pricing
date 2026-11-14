param([string]$BaseUrl='http://localhost:8080')
$ErrorActionPreference='Stop'
$s=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$c=Invoke-RestMethod "$BaseUrl/api/auth/csrf" -WebSession $s
$h=@{$c.headerName=$c.token}
$routes=@{}; Import-Csv src/main/resources/data/routes.csv | ForEach-Object {$routes[$_.route]=$_}
$results=@()
$rows=Import-Csv src/main/resources/data/my_forecast.csv
foreach($row in $rows | Where-Object {$_.date -in @('2026-06-01','2026-06-12','2026-07-01')}) {
 $r=$routes[$row.route]
 foreach($delta in @(0,1000)) {
  $price=[decimal]$r.base_price+$delta
  $expected=[decimal]$row.'0.5_base_demand'-[decimal]$r.price_sensitivity*($price-[decimal]$r.base_price)
  $sales=[Math]::Min([decimal]$row.seats,[Math]::Max([decimal]0,$expected))
  $body=@{route=$row.route;date=$row.date;price=$price}|ConvertTo-Json -Compress
  $a=Invoke-RestMethod "$BaseUrl/api/calculate" -Method Post -WebSession $s -Headers $h -ContentType application/json -Body $body
  if([decimal]$a.demand -ne $expected -or [decimal]$a.sales -ne $sales -or [decimal]$a.quantiles[4].demand -ne $expected){throw "Mismatch $body"}
  $results+=@{route=$row.route;date=$row.date;price=$price;demand=$expected;sales=$sales;passed=$true}
 }
}
$results | ConvertTo-Json -Depth 5 | Set-Content docs/independent-reference-results.json
Write-Host "PASS $($results.Count) independent CSV/API comparisons"

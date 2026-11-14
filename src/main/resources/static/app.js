// Small pure helpers are exported for regression tests; the formula lives only on the server.
export function parsePrice(raw) {
  const text = raw.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function requestGate() {
  let version = 0;
  return { next: () => ++version, current: id => id === version };
}
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function errorText(error) {
  if (error.status === 0) return 'Сервер недоступен. Проверьте подключение и попробуйте снова.';
  if (error.status === 403) return 'Запрос отклонён (403). Возможно, изменился защитный токен. Обновите подключение и повторите действие самостоятельно.';
  if (error.status >= 500) return 'Ошибка сервера. Параметры сохранены — попробуйте позже.';
  return error.message || 'Не удалось выполнить запрос.';
}

if (typeof document !== 'undefined') startApp();

function startApp() {
  const $ = id => document.getElementById(id);
  const fmt = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
  const state = { routes:[], csrf:null, csrfPromise:null, result:null, busy:false, authBusy:false, user:null, accountError:null };
  const gate = requestGate();
  let controller;
  let returnFocus;
  let authMode = 'login';
  let authVersion = 0;

  // Network errors retain HTTP status and server code. POSTs are never retried automatically.
  async function api(path, options = {}) {
    let response;
    try { response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options }); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError(0, 'NETWORK_ERROR', 'Сеть недоступна');
    }
    let body;
    try { body = await response.json(); }
    catch { throw new ApiError(response.status || 502, 'INVALID_RESPONSE', 'Сервер вернул непонятный ответ.'); }
    if (!response.ok) throw new ApiError(response.status, body.code || 'HTTP_ERROR', body.message);
    return body;
  }
  async function csrf() {
    if (!state.csrfPromise) {
      state.csrfPromise = api('/api/auth/csrf').then(token => { state.csrf = token; return token; }).finally(() => { state.csrfPromise = null; });
    }
    return state.csrfPromise;
  }
  async function post(path, body, form = false, signal) {
    const token = state.csrf || await csrf();
    try {
      return await api(path, { method:'POST', headers:{ 'Content-Type':form ? 'application/x-www-form-urlencoded' : 'application/json', [token.headerName]:token.token }, body:form ? new URLSearchParams(body) : JSON.stringify(body), signal });
    } catch (error) {
      if (error.status === 403) state.csrf = null;
      throw error;
    }
  }
  function status(message, error = false) {
    $('form-status').textContent = message;
    $('form-status').classList.toggle('error', error);
  }
  function readyButton() { $('calculate').disabled = !state.routes.length || state.busy || !state.csrf || state.authBusy; }
  function currentRoute() { return state.routes.find(route => route.route === $('route').value); }
  function invalidate() {
    gate.next(); controller?.abort(); state.busy = false;
    $('calculate').textContent = 'Рассчитать прогноз →';
    if (state.result) {
      $('stale-note').hidden = false;
      $('result-state').textContent = 'Предыдущий расчёт';
      $('result-state').className = 'badge stale';
    }
    $('price-error').textContent = '';
    $('price').removeAttribute('aria-invalid');
    status(state.result ? 'Сценарий изменён. Обновите расчёт.' : 'Готово к расчёту.');
    readyButton();
  }
  function setRoute() {
    const route = currentRoute();
    const previousDate = $('date').value;
    $('date').replaceChildren(...route.dates.map(date => new Option(dateLabel(date), date)));
    if (route.dates.includes(previousDate)) $('date').value = previousDate;
    $('price').value = String(route.base_price);
    $('price-range').textContent = `Справочный диапазон: ${fmt(route.price_min)}–${fmt(route.price_max)} ₽`;
    invalidate();
  }
  async function initialize() {
    $('recover').hidden = true;
    status('Загружаем каталог и готовим расчёт…');
    try {
      // Account status is optional and cannot delay the public calculator.
      const [catalog] = await Promise.all([api('/api/catalog'), csrf()]);
      if (!catalog.routes?.length) throw new ApiError(404, 'NO_DATA', 'В каталоге нет доступных рейсов.');
      state.routes = catalog.routes;
      $('route').replaceChildren(...state.routes.map(route => new Option(route.destination, route.route)));
      for (const id of ['route','date','price','base-price']) $(id).disabled = false;
      setRoute();
    } catch (error) { status(errorText(error), true); $('recover').hidden = false; }
    readyButton();
    void checkAccount();
  }
  $('route').addEventListener('change', setRoute);
  $('date').addEventListener('change', invalidate);
  $('price').addEventListener('input', invalidate);
  $('base-price').onclick = () => { $('price').value = String(currentRoute().base_price); invalidate(); $('price').focus(); };
  $('recover').onclick = async () => {
    if (!state.routes.length) return initialize();
    try { await csrf(); status('Подключение обновлено. Повторите расчёт.'); $('recover').hidden = true; }
    catch (error) { status(errorText(error), true); }
    readyButton();
  };
  $('scenario').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.busy || state.authBusy || !state.routes.length) return;
    const price = parsePrice($('price').value);
    if (price === null) {
      $('price-error').textContent = 'Введите положительную цену, например 9000 или 9000,50.';
      $('price').setAttribute('aria-invalid','true'); $('price').focus(); return;
    }
    const id = gate.next(); controller?.abort(); controller = new AbortController();
    state.busy = true; readyButton(); $('calculate').textContent = 'Считаем…'; status('Выполняем расчёт на сервере…');
    const input = { route:$('route').value, date:$('date').value, price };
    try {
      const result = await post('/api/calculate', input, false, controller.signal);
      if (!gate.current(id)) return;
      state.result = result; renderResult(); if (window.innerWidth < 821) $('result-route').focus({ preventScroll:false }); status('Прогноз готов.'); $('recover').hidden = true;
    } catch (error) {
      if (!gate.current(id) || error.name === 'AbortError') return;
      status(errorText(error), true); $('recover').hidden = ![0,403].includes(error.status);
    } finally {
      if (gate.current(id)) { state.busy = false; $('calculate').textContent = 'Рассчитать прогноз →'; readyButton(); }
    }
  });

  function renderResult() {
    const data = state.result;
    $('empty').hidden = true; $('result').hidden = false; $('stale-note').hidden = true;
    $('result-state').textContent = 'Рассчитано'; $('result-state').className = 'badge current';
    $('result-route').textContent = `Москва → ${state.routes.find(route => route.route === data.route).destination}`;
    $('result-context').textContent = `${dateLabel(data.date)} · ${fmt(data.price)} ₽ за билет`;
    for (const key of ['sales','demand','seats']) $(key).textContent = fmt(data[key]);
    $('interpretation').textContent = data.demand < 0
      ? 'Линейная модель дала отрицательный спрос. Прогноз продаж равен нулю; отрицательные значения сохранены на графике.'
      : data.demand > data.seats ? 'Спрос выше вместимости. Прогноз продаж ограничен общим числом мест.'
      : data.sales === 0 ? 'При этой цене модель не прогнозирует продаж.' : 'По медианному прогнозу вместимость не ограничивает продажи.';
    $('result-warning').hidden = !data.warnings.length;
    $('result-warning').textContent = data.warnings.join('. ') + (data.warnings.length ? '. Цена использована без изменений.' : '');
    $('median-label').textContent = fmt(data.demand); $('seats-label').textContent = fmt(data.seats);
    $('quantiles').replaceChildren(...data.quantiles.map(point => {
      const row = document.createElement('tr');
      if (point.q === .5) row.className = 'median';
      for (const value of [point.q === .5 ? '0,5 · медиана' : fmt(point.q), fmt(point.demand)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      return row;
    }));
    drawChart();
  }
  function drawChart() {
    if (!state.result || $('result').hidden) return;
    const data = state.result;
    const width = $('chart-wrap').clientWidth;
    if (!width) return;
    const height = width < 500 ? 290 : 300;
    const svg = $('chart'); svg.replaceChildren(); svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.setAttribute('height',height);
    const values = data.quantiles.map(point => point.demand).concat(data.seats,0);
    let lo = Math.min(...values), hi = Math.max(...values); const span = hi - lo || 1;
    lo -= span * .08; hi += span * .12;
    const left = Math.max(48, Math.min(90, Math.max(fmt(lo).length,fmt(hi).length)*7+14));
    const right = width - 14, top = 28, bottom = height - 46;
    const x = i => left + i * (right-left)/8;
    const y = value => bottom - (value-lo)/(hi-lo)*(bottom-top);
    function node(tag, attrs, text) {
      const element = document.createElementNS('http://www.w3.org/2000/svg',tag);
      for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,value);
      if (text !== undefined) element.textContent = text;
      svg.append(element); return element;
    }
    function line(x1,y1,x2,y2,attrs={}) { return node('line',{x1,y1,x2,y2,stroke:'#dbe2e8',...attrs}); }
    function label(px,py,text,attrs={}) { node('text',{x:px,y:py,fill:'#586a79','font-size':12,...attrs},text); }
    node('title',{id:'chart-title'},'Квантили спроса при выбранной цене');
    node('desc',{id:'chart-description'},`Медиана ${fmt(data.demand)}, вместимость ${fmt(data.seats)}. Полные значения доступны в раскрываемой таблице.`);
    label(0,15,'Спрос, пассажиры');
    for (let i=0;i<5;i++) {
      const value = lo+(hi-lo)*i/4;
      line(left,y(value),right,y(value));
      label(left-8,y(value)+4,fmt(Math.round(value)),{'text-anchor':'end'});
    }
    line(left,y(0),right,y(0),{stroke:'#8d9daa'});
    line(left,y(data.seats),right,y(data.seats),{stroke:'#8d581b','stroke-width':2,'stroke-dasharray':'6 4'});
    const median = data.quantiles[4];
    line(x(4),y(median.demand),x(4),bottom,{stroke:'#255ed3','stroke-dasharray':'2 4'});
    node('polyline',{points:data.quantiles.map((p,i)=>`${x(i)},${y(p.demand)}`).join(' '),fill:'none',stroke:'#255ed3','stroke-width':2.5});
    data.quantiles.forEach((point,i) => {
      if (i===4) node('path',{d:`M ${x(i)} ${y(point.demand)-7} l 7 7 -7 7 -7 -7 Z`,fill:'#255ed3',stroke:'white','stroke-width':1.5});
      else node('circle',{cx:x(i),cy:y(point.demand),r:3.5,fill:'white',stroke:'#255ed3','stroke-width':2});
      label(x(i),bottom+22,fmt(point.q),{'text-anchor':'middle','font-weight':i===4?700:400});
    });
    label((left+right)/2,height-3,'Уровень квантиля',{'text-anchor':'middle'});
    $('scale-note').textContent = (data.quantiles[8].demand-data.quantiles[0].demand)/span < .15
      ? 'Разброс квантилей сжат общим масштабом: показаны также ноль и вместимость. Все значения сохранены в таблице.' : '';
  }
  new ResizeObserver(drawChart).observe($('chart-wrap'));

  // Native modal dialog handles Tab containment and Escape; restore the original trigger explicitly.
  $('account-open').onclick = () => { returnFocus = document.activeElement; renderAccount(); $('account-dialog').showModal(); (state.user ? $('report') : $(`${authMode}-username`)).focus(); };
  $('account-close').onclick = () => $('account-dialog').close();
  $('account-dialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...$('account-dialog').querySelectorAll('button,input,a[href]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  $('account-dialog').addEventListener('close', () => { clearPasswords(); returnFocus?.focus(); });
  function clearPasswords() { $('login-password').value=''; $('register-password').value=''; }
  function switchAuth(mode) {
    authMode = mode; clearPasswords(); $('auth-status').textContent='';
    for (const name of ['login','register']) {
      $(`${name}-form`).hidden = name !== mode;
      $(`tab-${name}`).classList.toggle('active', name === mode);
      $(`tab-${name}`).setAttribute('aria-pressed',String(name === mode));
      for (const field of ['username','password']) $(`${name}-${field}-error`).textContent='';
    }
    $('account-title').textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    $(`${mode}-username`).focus();
  }
  $('tab-login').onclick = () => switchAuth('login');
  $('tab-register').onclick = () => switchAuth('register');
  function renderAccount() {
    $('account-open').textContent = state.user ? state.user.username : state.accountError ? 'Аккаунт: проверить' : 'Войти';
    $('account-title').textContent = state.user ? 'Ваш аккаунт' : authMode === 'login' ? 'Вход' : 'Регистрация';
    $('auth-forms').hidden = !!state.user; $('account-content').hidden = !state.user;
    $('account-name').textContent = state.user ? `Вы вошли как ${state.user.username}` : '';
    $('auth-recover').hidden = !state.accountError;
    if (state.accountError) $('auth-status').textContent = `Статус аккаунта неизвестен. ${errorText(state.accountError)}`;
  }
  async function checkAccount() {
    const version = authVersion;
    try { const user = await api('/api/auth/me'); if (version !== authVersion) return; state.user = user; state.accountError = null; }
    catch(error) {
      if (version !== authVersion) return;
      if (error.status === 401) { state.user = null; state.accountError = null; }
      else state.accountError = error;
    }
    renderAccount();
  }
  function lockAuth(busy) {
    state.authBusy = busy;
    for (const element of $('account-dialog').querySelectorAll('input,button:not(#account-close)')) element.disabled = busy;
    readyButton();
  }
  for (const mode of ['login','register']) {
    $(`${mode}-form`).addEventListener('submit', async event => {
      event.preventDefault(); if (state.authBusy) return;
      const username = $(`${mode}-username`).value;
      const password = $(`${mode}-password`).value;
      let valid = true;
      for (const field of ['username','password']) $(`${mode}-${field}-error`).textContent='';
      if (!username || (mode==='register' && !/^[A-Za-z0-9_.-]{3,100}$/.test(username))) {
        $(`${mode}-username-error`).textContent='Проверьте имя пользователя.'; $(`${mode}-username`).focus(); valid=false;
      }
      if (!password || (mode==='register' && (password.length<8 || new TextEncoder().encode(password).length>72))) {
        $(`${mode}-password-error`).textContent=mode==='register' ? 'Пароль: от 8 символов, не более 72 байт UTF-8 (кириллица занимает больше одного байта).' : 'Введите пароль.';
        if (valid) $(`${mode}-password`).focus(); valid=false;
      }
      if (!valid) return;
      authVersion++;
      lockAuth(true); $('auth-status').textContent=mode==='login'?'Входим…':'Создаём аккаунт…';
      try {
        const user = await post(`/api/auth/${mode}`,{username,password},mode==='login');
        clearPasswords();
        if (mode==='register') {
          switchAuth('login'); $('login-username').value=user.username; $('auth-status').textContent='Аккаунт создан. Введите пароль, чтобы войти.';
        } else {
          state.user=user; state.accountError=null; renderAccount(); $('auth-status').textContent='Вы вошли в аккаунт.';
        }
        state.csrf=null;
        try { await csrf(); } catch(error) { status(errorText(error),true); $('recover').hidden=false; }
      } catch(error) {
        $('auth-status').textContent=errorText(error);
        if (error.status===409) $('register-username-error').textContent='Это имя уже занято.';
        if (error.status===401) $('login-password-error').textContent='Имя пользователя или пароль не совпадают.';
        $('auth-recover').hidden=![0,403].includes(error.status);
      } finally { lockAuth(false); }
    });
  }
  $('logout').onclick = async () => {
    if (state.authBusy) return; lockAuth(true); $('auth-status').textContent='Выходим…';
    try {
      await post('/api/auth/logout',{}); state.user=null; state.accountError=null; clearPasswords(); $('report-content').textContent=''; renderAccount(); switchAuth('login'); $('auth-status').textContent='Вы вышли.'; state.csrf=null;
      try { await csrf(); } catch(error) { status(errorText(error),true); $('recover').hidden=false; }
    } catch(error) { $('auth-status').textContent=errorText(error); $('auth-recover').hidden=false; }
    finally { lockAuth(false); }
  };
  $('report').onclick = async () => {
    if (state.authBusy) return; lockAuth(true);
    try { const report=await api('/api/account/report'); $('report-content').textContent=report.message; $('auth-status').textContent='Памятка открыта.'; }
    catch(error) {
      if (error.status===401) { state.user=null; renderAccount(); $('auth-status').textContent='Сессия завершилась. Войдите снова.'; }
      else $('auth-status').textContent=errorText(error);
    } finally { lockAuth(false); }
  };
  $('auth-recover').onclick = async () => {
    lockAuth(true);
    try { await csrf(); await checkAccount(); if (!state.accountError) $('auth-status').textContent='Подключение обновлено. Повторите нужное действие.'; }
    catch(error) { $('auth-status').textContent=errorText(error); }
    finally { lockAuth(false); }
  };
  window.addEventListener('offline',()=>status('Подключение потеряно. Введённые параметры сохранены.',true));
  window.addEventListener('online',()=>{ status('Подключение восстановлено. Повторите расчёт.'); $('recover').hidden=false; });
  void initialize();
}



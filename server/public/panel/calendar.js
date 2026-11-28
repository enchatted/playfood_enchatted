const pad = n => String(n).padStart(2, '0');
const iso = d => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const date = value => new Date(`${value}T12:00:00`);
const today = () => iso(new Date());
const longDate = value => date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function validISO(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date(value).getTime()) && iso(date(value)) === value;
}

export function moveMonth(value, offset) {
  const d = date(value), day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}

export function monthDays(value) {
  const start = date(value);
  start.setDate(1);
  start.setDate(1 - (start.getDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return iso(d);
  });
}

export function mountCalendar(fromInput, toInput) {
  const dialog = document.createElement('dialog');
  dialog.className = 'date-calendar';
  dialog.setAttribute('aria-labelledby', 'calendarTitle');
  dialog.innerHTML = `
    <header class="calendar-heading"><h2 id="calendarTitle">Choose date</h2><button type="button" data-close aria-label="Close calendar">✕</button></header>
    <div class="calendar-navigation">
      <button type="button" data-prev aria-label="Previous month">‹</button>
      <label class="calendar-month-label"><span class="sr-only">Month</span><select aria-label="Month"></select></label>
      <label class="calendar-year-label"><span class="sr-only">Year</span><input aria-label="Year" type="number" min="1" max="9999" step="1"></label>
      <button type="button" data-next aria-label="Next month">›</button>
    </div>
    <p class="sr-only" data-announcement aria-live="polite"></p>
    <div class="calendar-weekdays" aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
    <div class="calendar-days" role="group" aria-label="Days"></div>
    <p class="calendar-hint">Arrow keys move between days. Enter selects; Escape closes.</p>
    <footer class="calendar-actions"><button type="button" data-clear>Clear</button><button type="button" data-today>Today</button></footer>`;
  document.body.appendChild(dialog);
  const find = selector => dialog.querySelector(selector);
  const monthSelect = find('select');
  const yearInput = find('input');
  for (let m = 0; m < 12; m++) {
    monthSelect.add(new Option(new Date(2026, m, 1).toLocaleDateString('en-GB', { month: 'long' }), String(m)));
  }
  let activeInput, opener, focusedDay;
  const buttons = new Map();
  const allowed = value => validISO(value) && (activeInput === fromInput
    ? !toInput.value || value <= toInput.value
    : !fromInput.value || value >= fromInput.value);
  const bound = value => activeInput === fromInput && toInput.value && value > toInput.value ? toInput.value
    : activeInput === toInput && fromInput.value && value < fromInput.value ? fromInput.value : value;

  function sync() {
    for (const [input, button] of buttons) {
      const label = input === fromInput ? 'From' : 'To';
      button.querySelector('.date-value').textContent = input.value ? longDate(input.value) : 'Choose date';
      button.setAttribute('aria-label', `${label}: ${input.value ? longDate(input.value) : 'Choose date'}`);
    }
  }
  function render(focus = false) {
    const shown = date(focusedDay);
    monthSelect.value = String(shown.getMonth());
    yearInput.value = String(shown.getFullYear());
    find('[data-announcement]').textContent = shown.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const grid = find('.calendar-days');
    grid.replaceChildren();
    for (const value of monthDays(focusedDay)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.date = value;
      button.textContent = String(date(value).getDate());
      button.setAttribute('aria-label', longDate(value));
      button.setAttribute('aria-pressed', String(value === activeInput.value));
      if (value === today()) button.setAttribute('aria-current', 'date');
      button.classList.toggle('outside-month', date(value).getMonth() !== shown.getMonth());
      button.disabled = !allowed(value);
      button.tabIndex = value === focusedDay ? 0 : -1;
      button.addEventListener('click', () => choose(value));
      grid.appendChild(button);
    }
    find('[data-today]').disabled = !allowed(today());
    if (focus) grid.querySelector(`[data-date="${focusedDay}"]`)?.focus();
  }
  function choose(value) {
    if (value && !allowed(value)) return;
    activeInput.value = value;
    sync();
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    dialog.close();
  }
  function changeMonth(offset) {
    const next = moveMonth(focusedDay, offset);
    if (validISO(next)) { focusedDay = next; render(); }
  }
  for (const input of [fromInput, toInput]) {
    const label = input === fromInput ? 'From' : 'To';
    input.type = 'hidden';
    const button = document.createElement('button');
    button.className = 'date-trigger';
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="date-value"></span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M7 2v6m10-6v6M3 11h18"/></svg>';
    input.after(button);
    buttons.set(input, button);
    button.addEventListener('click', () => {
      activeInput = input;
      opener = button;
      focusedDay = bound(input.value || today());
      find('h2').textContent = label === 'From' ? 'Choose start date' : 'Choose end date';
      button.setAttribute('aria-expanded', 'true');
      render();
      dialog.showModal();
      render(true);
    });
  }
  find('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { opener?.setAttribute('aria-expanded', 'false'); opener?.focus(); });
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  find('[data-prev]').addEventListener('click', () => changeMonth(-1));
  find('[data-next]').addEventListener('click', () => changeMonth(1));
  monthSelect.addEventListener('change', () => { focusedDay = `${yearInput.value.padStart(4, '0')}-${pad(Number(monthSelect.value) + 1)}-01`; render(); });
  function applyYear() {
    if (!yearInput.value || !yearInput.checkValidity()) { render(); return; }
    const nextYear = Number(yearInput.value);
    if (nextYear === date(focusedDay).getFullYear()) return;
    focusedDay = `${String(nextYear).padStart(4, '0')}-${pad(Number(monthSelect.value) + 1)}-01`;
    render();
  }
  yearInput.addEventListener('change', applyYear);
  yearInput.addEventListener('blur', applyYear);
  yearInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyYear(); }
  });
  find('.calendar-days').addEventListener('keydown', e => {
    const value = e.target.dataset.date;
    if (!value) return;
    const d = date(value);
    const shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -(d.getDay() + 6) % 7, End: 6 - (d.getDay() + 6) % 7 };
    let next;
    if (e.key in shifts) { d.setDate(d.getDate() + shifts[e.key]); next = iso(d); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = moveMonth(value, e.key === 'PageUp' ? -1 : 1);
    else return;
    e.preventDefault();
    next = bound(next);
    if (validISO(next)) { focusedDay = next; render(true); }
  });
  find('[data-clear]').addEventListener('click', () => choose(''));
  find('[data-today]').addEventListener('click', () => choose(today()));
  sync();
  return { sync };
}

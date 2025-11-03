

// frontend/items/staffers.js
// Staffers page: list + soft delete/restore, pagination

async function createStaffersPage() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:16px;';

  const h = document.createElement('h2');
  h.textContent = 'Сотрудники';
  h.style.cssText = 'color:#198754;margin-bottom:12px;';
  wrap.appendChild(h);

  // Toolbar
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:12px;';

  const showDeleted = document.createElement('input');
  showDeleted.type = 'checkbox';
  const lblDel = document.createElement('label');
  lblDel.appendChild(showDeleted);
  lblDel.appendChild(document.createTextNode(' Показать удаленные'));
  bar.appendChild(lblDel);

  // Rows per page selector
  const pageSizeWrap = document.createElement('label');
  pageSizeWrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:12px;';
  const pageSizeText = document.createElement('span');
  pageSizeText.textContent = 'Строк на странице:';
  const pageSize = document.createElement('select');
  ['5','10','20','50'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    if (v === '10') opt.selected = true;
    pageSize.appendChild(opt);
  });
  pageSizeWrap.appendChild(pageSizeText);
  pageSizeWrap.appendChild(pageSize);
  bar.appendChild(pageSizeWrap);

  wrap.appendChild(bar);

  // Table
  const table = document.createElement('table');
  table.id = 'staffers-table';
  table.style.cssText = 'width:100%;border-collapse:collapse;';
  table.innerHTML = `
    <thead style="background:#f8f9fa;font-weight:bold">
      <tr>
        <th style="border:1px solid #ddd;padding:8px;width:80px">ID</th>
        <th style="border:1px solid #ddd;padding:8px;width:160px">Табельный №</th>
        <th style="border:1px solid #ddd;padding:8px">ФИО</th>
        <th style="border:1px solid #ddd;padding:8px;width:160px">ИИН</th>
        <th style="border:1px solid #ddd;padding:8px;width:220px">Действия</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  wrap.appendChild(table);

  const pager = document.createElement('div');
  pager.id = 'staffers-pager';
  pager.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-top:10px;';
  wrap.appendChild(pager);

  async function load(page = 1, limit = 10) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      deleted: showDeleted.checked ? 'true' : 'false',
      sort: 'cat3__id',
      dir: 'asc'
    });

    showLoading?.(true);
    try {
      const r = await fetch(`/api/staffers?${params.toString()}`);
      if (!r.ok) throw new Error('Не удалось загрузить список');
      const j = await r.json();

      const tb = table.querySelector('tbody');
      tb.innerHTML = '';

      const rows = j.items || [];
      if (rows.length === 0) {
        tb.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center;color:#888;padding:18px;">Нет данных для отображения</td>
          </tr>
        `;
      } else {
        rows.forEach(row => {
          const tr = document.createElement('tr');
          if (row.cat3__deleted) tr.classList.add('deleted');
          tr.innerHTML = `
            <td style="border:1px solid #ddd;padding:8px;text-align:center">${row.cat3__id}</td>
            <td style="border:1px solid #ddd;padding:8px">${row.cat3__tabno}</td>
            <td style="border:1px solid #ddd;padding:8px">${row.person_fio || ''}</td>
            <td style="border:1px solid #ddd;padding:8px">${row.cat2__iin || ''}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center">
              ${row.cat3__deleted
                ? `<button class="btn btn-info" data-restore="${row.cat3__uuid}">Восстановить</button>`
                : `<button class="btn btn-danger" data-delete="${row.cat3__uuid}">Удалить</button>`}
            </td>
          `;
          tb.appendChild(tr);
        });
      }

      // actions
      tb.querySelectorAll('[data-delete]').forEach(b => {
        b.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          const uuid = btn.getAttribute('data-delete');
          if (!confirm('Удалить сотрудника?')) return;
          btn.disabled = true; showLoading?.(true);
          try {
            const resp = await fetch(`/api/staffers/${uuid}`, { method: 'DELETE' });
            if (!resp.ok) {
              const err = await resp.json().catch(()=>({}));
              showToast?.(err.error || 'Ошибка удаления', 'error');
            } else {
              showToast?.('Сотрудник помечен как удалённый', 'success');
            }
            await load(page, limit);
          } finally { btn.disabled = false; showLoading?.(false); }
        });
      });

      tb.querySelectorAll('[data-restore]').forEach(b => {
        b.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          const uuid = btn.getAttribute('data-restore');
          btn.disabled = true; showLoading?.(true);
          try {
            const resp = await fetch(`/api/staffers/${uuid}/restore`, { method: 'PUT' });
            if (!resp.ok) {
              const err = await resp.json().catch(()=>({}));
              showToast?.(err.error || 'Ошибка восстановления', 'error');
            } else {
              showToast?.('Сотрудник восстановлен', 'success');
            }
            await load(page, limit);
          } finally { btn.disabled = false; showLoading?.(false); }
        });
      });

      // pager
      const pages = Math.max(1, Math.ceil((j.total || 0) / (j.limit || 1)));
      pager.innerHTML = '';
      const mk = (t, p, dis, act) => {
        const bb = document.createElement('button');
        bb.textContent = t; bb.disabled = !!dis; bb.className = 'btn';
        if (act) { bb.style.background = '#0d6efd'; bb.style.color = '#fff'; }
        if (!dis) bb.addEventListener('click', () => load(p, limit));
        return bb;
      };
      const current = Number(j.page) || page || 1;
      pager.appendChild(mk('« Prev', Math.max(1, current - 1), current <= 1, false));
      for (let p = Math.max(1, current - 2); p <= Math.min(pages, current + 2); p++) {
        pager.appendChild(mk(String(p), p, false, p === current));
      }
      pager.appendChild(mk('Next »', Math.min(pages, current + 1), current >= pages, false));
    } catch (err) {
      showToast?.(err.message || 'Ошибка загрузки', 'error');
    } finally {
      showLoading?.(false);
    }
  }

  // events
  let t;
  showDeleted.addEventListener('change', () => load(1, parseInt(pageSize.value, 10)));
  pageSize.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) load(1, val);
  });

  await load(1, parseInt(pageSize.value, 10));
  return wrap;
}

window.createStaffersPage = createStaffersPage;
// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => any;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  searchFields?: string[];
  pageSize?: number;
  emptyMessage?: string;
  emptyAction?: any;
  sortBy?: string;
  sortDesc?: boolean;
}

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString();
}

function relTime(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "just now";
  if (diffHour < 1) return diffMin + "m ago";
  if (diffDay < 1) return diffHour + "h ago";
  if (diffDay < 7) return diffDay + "d ago";
  return fmtDate(date);
}

export { fmtDate, relTime };

export const DataTable: FC<DataTableProps<any>> = ({
  rows,
  columns,
  searchFields = [],
  pageSize = 10,
  emptyMessage = "No items yet.",
  emptyAction,
  sortBy,
  sortDesc = true,
}) => {
  if (rows.length === 0) {
    return (
      <div class="empty-state">
        <p>{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  // Sort rows if sortBy provided
  let sorted = [...rows];
  if (sortBy) {
    sorted.sort((a, b) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      const da = va instanceof Date ? va : new Date(va);
      const db = vb instanceof Date ? vb : new Date(vb);
      return sortDesc
        ? db.getTime() - da.getTime()
        : da.getTime() - db.getTime();
    });
  }

  const id = "dt" + Math.random().toString(36).slice(2, 8);
  const pages = Math.ceil(sorted.length / pageSize);

  return (
    <div class="data-table-container" id={id}>
      {searchFields.length > 0 && (
        <div class="data-table-search">
          <input
            type="text"
            placeholder="Filter..."
            class="data-table-search-input"
            data-dt-search={id}
          />
        </div>
      )}

      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} class={col.className}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={String(row.id || i)}
                class="data-table-row"
                data-dt-page={String(Math.floor(i / pageSize) + 1)}
              >
                {columns.map((col) => (
                  <td key={col.key} class={col.className}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div class="data-table-paginator" data-dt-pag={id}>
          <button class="page-btn" data-dt-prev={id}>
            &lt; Prev
          </button>
          <span class="page-info" data-dt-info={id}>
            Page 1 of {pages}
          </span>
          <button class="page-btn" data-dt-next={id}>
            Next &gt;
          </button>
        </div>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `
        (function(){
          var id="${id}",pageSize=${pageSize},totalPages=${pages},cur=1;
          var wrap=document.getElementById(id);
          if(!wrap)return;
          var rows=wrap.querySelectorAll('.data-table-row');
          function show(p){
            rows.forEach(function(r){r.style.display=parseInt(r.dataset.dtPage)===p?'':'none';});
            var info=wrap.querySelector('[data-dt-info="'+id+'"]');
            if(info)info.textContent='Page '+p+' of '+totalPages;
            cur=p;
          }
          var prev=wrap.querySelector('[data-dt-prev="'+id+'"]');
          var next=wrap.querySelector('[data-dt-next="'+id+'"]');
          if(prev)prev.addEventListener('click',function(){if(cur>1)show(cur-1);});
          if(next)next.addEventListener('click',function(){if(cur<totalPages)show(cur+1);});
          var search=wrap.querySelector('[data-dt-search="'+id+'"]');
          var searchFields=${JSON.stringify(searchFields)};
          if(search){
            search.addEventListener('input',function(e){
              var t=e.target.value.toLowerCase();
              if(!t){show(1);var pag=wrap.querySelector('[data-dt-pag="'+id+'"]');if(pag)pag.style.display='';return;}
              var colIndexMap={};
              var headers=wrap.querySelectorAll('.data-table th');
              headers.forEach(function(th,idx){colIndexMap[th.textContent.trim().toLowerCase()]=idx;});
              rows.forEach(function(r){
                var cells=r.querySelectorAll('td');
                var match=false;
                searchFields.forEach(function(field){
                  var idx=colIndexMap[field.toLowerCase()];
                  if(idx!==undefined && cells[idx] && cells[idx].textContent.toLowerCase().indexOf(t)!==-1)match=true;
                });
                r.style.display=match?'':'none';
              });
              var pag=wrap.querySelector('[data-dt-pag="'+id+'"]');
              if(pag)pag.style.display='none';
            });
          }
          show(1);
        })();
      `,
        }}
      />
    </div>
  );
};

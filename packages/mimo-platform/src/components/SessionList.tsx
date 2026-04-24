import type { FC } from "hono/jsx";

export interface SessionListItem {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  createdAt: Date | string;
  projectId: string;
  priority: "high" | "medium" | "low";
}

interface SessionListProps {
  sessions: SessionListItem[];
  showProject?: boolean;
  projectNames?: Record<string, string>;
  showSearch?: boolean;
  pageSize?: number;
  emptyMessage?: string;
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

export const SessionList: FC<SessionListProps> = ({
  sessions,
  showProject = false,
  projectNames = {},
  showSearch = true,
  pageSize = 10,
  emptyMessage = "No sessions yet.",
}) => {
  if (sessions.length === 0) {
    return (
      <div class="empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...sessions].sort((a, b) => {
    const pw =
      (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
    if (pw !== 0) return pw;
    const da =
      a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
    const db =
      b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    return db.getTime() - da.getTime();
  });

  const id = "sl" + Math.random().toString(36).slice(2, 7);
  const pages = Math.ceil(sorted.length / pageSize);

  return (
    <div class="session-list-container" id={id}>
      {showSearch && sorted.length > pageSize && (
        <div class="session-search">
          <input
            type="text"
            placeholder="Filter sessions..."
            class="session-search-input"
            data-sl-search={id}
           data-help-id="session-list-session-search-input-input" />
        </div>
      )}

      <div class="session-table-wrap">
        <table class="session-table">
          <thead>
            <tr>
              <th>Name</th>
              {showProject && <th>Project</th>}
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr
                key={s.id}
                class="session-table-row"
                data-sl-page={String(Math.floor(i / pageSize) + 1)}
              >
                <td>
                  <a
                    href={`/projects/${s.projectId}/sessions/${s.id}`}
                    class="session-name"
                   data-help-id="session-list-session-name-a">
                    {s.name}
                  </a>
                </td>
                {showProject && (
                  <td>
                    <span class="session-project">
                      {projectNames[s.projectId] || s.projectId.slice(0, 8)}
                    </span>
                  </td>
                )}
                <td>
                  <span class={`session-priority ${s.priority}`}>
                    {s.priority}
                  </span>
                </td>
                <td>
                  <span class={`session-status ${s.status}`}>{s.status}</span>
                </td>
                <td class="session-time" title={fmtDate(s.createdAt)}>
                  {relTime(s.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div class="session-paginator" data-sl-pag={id}>
          <button class="page-btn" data-sl-prev={id} data-help-id="session-list-page-btn-button">
            &lt; Prev
          </button>
          <span class="page-info" data-sl-info={id}>
            Page 1 of {pages}
          </span>
          <button class="page-btn" data-sl-next={id} data-help-id="session-list-page-btn-button">
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
          var rows=wrap.querySelectorAll('.session-table-row');
          function show(p){
            rows.forEach(function(r){r.style.display=parseInt(r.dataset.slPage)===p?'':'none';});
            var info=wrap.querySelector('[data-sl-info="'+id+'"]');
            if(info)info.textContent='Page '+p+' of '+totalPages;
            cur=p;
          }
          var prev=wrap.querySelector('[data-sl-prev="'+id+'"]');
          var next=wrap.querySelector('[data-sl-next="'+id+'"]');
          if(prev)prev.addEventListener('click',function(){if(cur>1)show(cur-1);});
          if(next)next.addEventListener('click',function(){if(cur<totalPages)show(cur+1);});
          var search=wrap.querySelector('[data-sl-search="'+id+'"]');
          if(search){
            search.addEventListener('input',function(e){
              var t=e.target.value.toLowerCase();
              if(!t){show(1);wrap.querySelector('[data-sl-pag="'+id+'"]').style.display='';return;}
              rows.forEach(function(r){
                var n=r.querySelector('.session-name').textContent.toLowerCase();
                var pr=r.querySelector('.session-project');
                var pt=pr?pr.textContent.toLowerCase():'';
                r.style.display=(n.indexOf(t)!==-1||pt.indexOf(t)!==-1)?'':'none';
              });
              var pag=wrap.querySelector('[data-sl-pag="'+id+'"]');
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

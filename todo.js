'use strict';

const Store=(()=>{

    const save=(key, value)=>{
        try{ localStorage.setItem(key, JSON.stringify(value)); }
        catch(e){}
    };

    const load=(key)=>{
        try{
            const result=localStorage.getItem(key);
            return result?JSON.parse(result): null;
        }
        catch(e) {return null;}
    };

    return {
        saveProjects: value=>save('tf2_projects', value),
        loadProjects: ()=>load('tf2_projects'),
        saveTodos: value=>save('tf2_todos', value),
        loadTodos: ()=>load('tf2_todos'),
    };
})();


const Projects=(()=>{
    let list=[];

    const defaults=[
        {id: 'default', name: 'Personal', color: 'hsl(245, 26%, 67%)'},
        {id: 'work', name: 'Work', color: 'hsl(25, 73%, 56%)'},
    ];

    const persist=()=>Store.saveProjects(list);

    const init=()=>{
        const saved=Store.loadProjects();
        list=saved && saved.length? saved: [...defaults];
    };

    const all=()=>[...list];
    const byId=id=>list.find(p=>p.id===id);

    const add=(name, color)=>{
        const project={id: `p_${Date.now()}`, name: name.trim(), color};
        list.push(project);
        persist();
        return project;
    };

    const del=id=>{
        if(id==='default') return;
        list=list.filter(p=>p.id!==id);
        persist();
    };

    return{init, all, byId, add, del};
})();


const Todos=(()=>{
    let list=[];
    const persist=()=>Store.saveTodos(list);
    const init=()=>{
        const saved=Store.loadTodos();
        list=saved && saved.length? saved: [];
    };

    const all=()=>[...list];
    const byId=id=>list.find(t=>t.id===id);
    const byProject=pid=>list.filter(t=>t.projectId===pid);

    const today=()=>{
        const date=new Date().toISOString().split('T')[0];
        return list.filter(t=>t.dueDate===date);
    };

    const highPri=()=>list.filter(t=>t.priority==='high' && !t.done);
    const completed=()=>list.filter(t=>t.done);

    const create=(fields)=>{
        const todo={id:`t_${Date.now()}`, done:false, createdAt:new Date().toISOString(), checklist:[], ...fields };
        list.push(todo);
        persist();
        return todo;
    };

    const update=(id,fields)=>{
        const index=list.findIndex(t=>t.id===id);
        if(index<0) return null;
        list[index]={...list[index], ...fields};
        persist();
        return list[index];
    };

    const toggle=id=>{
        const todo=list.find(t=>t.id===id);
        if(!todo) return;
        todo.done=!todo.done;
        persist();
        return todo;
    };

    const del=id=>{
        const existed=list.some(t=>t.id===id);
        list=list.filter(t=>t.id!==id);
        if(existed) persist();
    };

    const migrateProject=pid=>{
        list=list.map(t=>t.projectId===pid?{...t, projectId: 'default'}:t);
        persist();
    };

    return{init, all, byId, byProject, today, highPri, completed, create, update, toggle, del, migrateProject};
})();


const Utils=(()=>{

    const fmtDate = iso => {
        if(!iso) return '—';
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const dueInfo = iso => {
        if(!iso) return { text: '—', cls: '' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [y, m, d] = iso.split('-').map(Number);
        const due = new Date(y, m - 1, d);

        if(due < today) return { text: `Overdue · ${fmtDate(iso)}`, cls: 'overdue' };
        if(due.getTime() === today.getTime()) return { text: 'Due today', cls: 'due-today' };

        return { text: fmtDate(iso), cls: '' };
    };

    const esc = str => str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return { fmtDate, dueInfo, esc };
})();


let currentView='all';
let currentPF='all';
let currentSort='createdAt';
let editingId=null;
let detailId=null;
let selColor='#7e74d8';
let checklist=[];


const $  = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const openModal  = id => $(id).classList.add('open');
const closeModal = id => $(id).classList.remove('open');


function toast(msg, type='') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toastWrap').appendChild(el);
    setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 250);
    }, 2600);
}


function renderStats() {
    const all = Todos.all();
    $('statTotal').textContent     = all.length;
    $('statDone').textContent      = all.filter(t => t.done).length;
    $('todayBadge').textContent    = Todos.today().length;
    $('priorityBadge').textContent = Todos.highPri().length;
}


function renderProjects() {
    const allTodos = Todos.all();

    $('projectList').innerHTML = Projects.all().map(p => {
        const count = allTodos.filter(t => t.projectId === p.id).length;

        return `<li class="project-item${currentView === p.id ? ' active' : ''}" data-pid="${p.id}">
          <span class="proj-dot" style="background:${p.color}"></span>
          <span class="proj-name">${Utils.esc(p.name)}</span>
          <span class="proj-count">${count}</span>
          ${p.id !== 'default' ? `<button class="proj-del" data-dpid="${p.id}" title="Delete">×</button>` : ''}
        </li>`;
    }).join('');

    $$('.project-item').forEach(el => {
        el.addEventListener('click', e => {
            if(e.target.closest('[data-dpid]')) return;
            setView(el.dataset.pid);
        });
    });

    $$('[data-dpid]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const pid = btn.dataset.dpid;
            const project = Projects.byId(pid);
            if(!project || !confirm(`Delete project "${project.name}"? Tasks move to Personal.`)) return;
            Todos.migrateProject(pid);
            Projects.del(pid);
            if(currentView === pid) setView('default');
            else { renderProjects(); renderTodos(); }
            toast(`"${project.name}" deleted.`);
        });
    });
}


function setView(view) {
    currentView = view;

    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.project-item').forEach(el => el.classList.toggle('active', el.dataset.pid === view));

    const titles = { all: 'All Tasks', today: 'Today', priority: 'High Priority', completed: 'Completed' };
    let title = titles[view];
    if(!title) {
        const project = Projects.byId(view);
        title = project ? project.name : 'Tasks';
    }

    $('viewTitle').textContent = title;
    $('viewSub').textContent = view === 'today'
        ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : '';

    renderTodos();
    renderStats();
    closeSidebar();
}


function getVisible() {
    let list;

    if      (currentView === 'all')       list = Todos.all();
    else if (currentView === 'today')     list = Todos.today();
    else if (currentView === 'priority')  list = Todos.highPri();
    else if (currentView === 'completed') list = Todos.completed();
    else                                  list = Todos.byProject(currentView);

    if(currentPF !== 'all') list = list.filter(t => t.priority === currentPF);

    const priorityOrder = { high: 0, medium: 1, low: 2 };

    list = [...list].sort((a, b) => {
        if(a.done !== b.done) return a.done ? 1 : -1;
        if(currentSort === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
        if(currentSort === 'dueDate')  return (a.dueDate || '').localeCompare(b.dueDate || '');
        if(currentSort === 'title')    return a.title.localeCompare(b.title);
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
}


function renderTodos() {
    renderStats();
    renderProjects();

    const list = getVisible();
    const container = $('todoList');
    container.innerHTML = '';

    if(list.length === 0) {
        $('emptyState').style.display = 'flex';
        return;
    }

    $('emptyState').style.display = 'none';

    list.forEach(todo => {
        const { text: dueText, cls: dueCls } = Utils.dueInfo(todo.dueDate);
        const project = Projects.byId(todo.projectId);

        const projTag = project
            ? `<span class="proj-tag">
                <span style="width:5px;height:5px;border-radius:50%;background:${project.color};display:inline-block"></span>
                ${Utils.esc(project.name)}
               </span>`
            : '';

        const calIcon = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x=".5" y="1.5" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M3 .5v2M8 .5v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <path d=".5 4.5h10" stroke="currentColor" stroke-width="1.2"/>
        </svg>`;

        const card = document.createElement('div');
        card.className = `todo-card${todo.done ? ' done' : ''}`;
        card.dataset.p = todo.priority;

        card.innerHTML = `
            <input type="checkbox" class="todo-check" ${todo.done ? 'checked' : ''} />
            <div class="todo-body">
                <div class="todo-title">${Utils.esc(todo.title)}</div>
                <div class="todo-meta">
                    <span class="p-badge ${todo.priority}">${todo.priority}</span>
                    <span class="due-tag ${dueCls}">${calIcon} ${dueText}</span>
                    ${projTag}
                </div>
            </div>
            <div class="todo-actions">
                <button class="todo-act edit" title="Edit">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="todo-act del" title="Delete">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.5 7h6l.5-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>`;

        card.querySelector('.todo-check').addEventListener('click', e => {
            e.stopPropagation();
            Todos.toggle(todo.id);
            renderTodos();
        });

        card.querySelector('.edit').addEventListener('click', e => {
            e.stopPropagation();
            openTodoModal(todo.id);
        });

        card.querySelector('.del').addEventListener('click', e => {
            e.stopPropagation();
            if(!confirm('Delete this task?')) return;
            Todos.del(todo.id);
            renderTodos();
            toast('Task deleted.');
        });

        card.addEventListener('click', () => openDetail(todo.id));
        container.appendChild(card);
    });
}


function populateProjSelect(selectedId) {
    $('todoProjectSel').innerHTML = Projects.all().map(p =>
        `<option value="${p.id}"${p.id === (selectedId || 'default') ? ' selected' : ''}>${Utils.esc(p.name)}</option>`
    ).join('');
}

function openTodoModal(id=null) {
    editingId = id;
    checklist = [];

    $('checklistItems').innerHTML = '';
    $('todoTitle').value = $('todoDesc').value = $('todoDue').value = $('todoNotes').value = '';
    $('todoPriority').value = 'medium';

    $$('.err-msg').forEach(e => e.classList.remove('show'));
    $$('.invalid').forEach(e => e.classList.remove('invalid'));

    if(id){
        const todo=Todos.byId(id);
        if(!todo) return;

        $('modalTitle').textContent='Edit Task';
        $('modalSave').textContent='Save Changes';
        $('todoTitle').value=todo.title;
        $('todoDesc').value=todo.description || '';
        $('todoDue').value=todo.dueDate || '';
        $('todoPriority').value=todo.priority;
        $('todoNotes').value=todo.notes || '';
        checklist=(todo.checklist || []).map(c=>({ ...c }));

        populateProjSelect(todo.projectId);
    }
    else {
        $('modalTitle').textContent = 'New Task';
        $('modalSave').textContent  = 'Save Task';

        const defaultProj = (currentView !== 'all' && currentView !== 'today' && currentView !== 'priority' && currentView !== 'completed')
            ? currentView
            : 'default';

        populateProjSelect(defaultProj);
    }

    renderChecklist();
    openModal('todoModal');
    setTimeout(() => $('todoTitle').focus(), 60);
}

function renderChecklist() {
    $('checklistItems').innerHTML = checklist.map((item, index) => `
        <li class="checklist-item">
            <input type="checkbox" class="ci-check" ${item.done ? 'checked' : ''} data-ci="${index}"/>
            <span class="ci-label${item.done ? ' checked' : ''}">${Utils.esc(item.text)}</span>
            <button class="ci-del" data-cid="${index}" title="Remove">×</button>
        </li>`
    ).join('');

    $$('.ci-check').forEach(cb => {
        cb.addEventListener('change', () => {
            checklist[+cb.dataset.ci].done = cb.checked;
            renderChecklist();
        });
    });

    $$('.ci-del').forEach(btn => {
        btn.addEventListener('click', () => {
            checklist.splice(+btn.dataset.cid, 1);
            renderChecklist();
        });
    });
}

function saveTodo() {
    let valid = true;
    const titleInput = $('todoTitle');
    const dateInput  = $('todoDue');

    if(!titleInput.value.trim()) {
        titleInput.classList.add('invalid');
        $('titleErr').classList.add('show');
        valid = false;
    }
    else {
        titleInput.classList.remove('invalid');
        $('titleErr').classList.remove('show');
    }

    if(!dateInput.value) {
        dateInput.classList.add('invalid');
        $('dateErr').classList.add('show');
        valid = false;
    }
    else {
        dateInput.classList.remove('invalid');
        $('dateErr').classList.remove('show');
    }

    if(!valid) return;

    const fields = {
        title:       titleInput.value.trim(),
        description: $('todoDesc').value.trim(),
        dueDate:     dateInput.value,
        priority:    $('todoPriority').value,
        projectId:   $('todoProjectSel').value,
        notes:       $('todoNotes').value.trim(),
        checklist:   [...checklist],
    };

    if(editingId) {
        Todos.update(editingId, fields);
        toast('Task updated!', 'success');
    }
    else {
        Todos.create(fields);
        toast('Task created!', 'success');
    }

    closeModal('todoModal');
    renderTodos();
}


function openDetail(id) {
    detailId = id;
    const todo = Todos.byId(id);
    if(!todo) return;

    const project = Projects.byId(todo.projectId);
    const { text: dueText, cls: dueCls } = Utils.dueInfo(todo.dueDate);

    $('detailTitle').textContent = todo.title;
    $('detailBody').innerHTML = `
        <div class="detail-grid">
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-val">${todo.done ? '✅ Completed' : '⏳ Pending'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Priority</span>
                <span class="p-badge ${todo.priority}">${todo.priority}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Due</span>
                <span class="detail-val due-tag ${dueCls}" style="background:none;padding:0">${dueText}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Project</span>
                <span class="detail-val">${project ? Utils.esc(project.name) : '—'}</span>
            </div>
            ${todo.description ? `
            <div class="detail-row">
                <span class="detail-label">Description</span>
                <span class="detail-val">${Utils.esc(todo.description)}</span>
            </div>` : ''}
            ${todo.notes ? `
            <div class="detail-row">
                <span class="detail-label">Notes</span>
                <span class="detail-val">${Utils.esc(todo.notes)}</span>
            </div>` : ''}
            ${todo.checklist && todo.checklist.length ? `
            <div class="detail-row">
                <span class="detail-label">Checklist</span>
                <span class="detail-val">
                    ${todo.checklist.map(c => `
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.done ? 'var(--accent)' : 'var(--border-med)'};flex-shrink:0"></span>
                        ${Utils.esc(c.text)}
                    </div>`).join('')}
                </span>
            </div>` : ''}
            <div class="detail-row">
                <span class="detail-label">Created</span>
                <span class="detail-val">${Utils.fmtDate(todo.createdAt.split('T')[0])}</span>
            </div>
        </div>`;

    openModal('detailModal');
}


function openProjectModal(){
    $('projName').value = '';
    $('projNameErr').classList.remove('show');
    $('projName').classList.remove('invalid');

    selColor = '#7c6ff7';
    $$('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === selColor));

    openModal('projectModal');
    setTimeout(() => $('projName').focus(), 60);
}


function openSidebar()  { $('sidebar').classList.add('open');    $('sidebarOverlay').classList.add('open'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.remove('open'); }


let sortOpen=false;

function toggleSort(e){
    e.stopPropagation();
    sortOpen=!sortOpen;

    const dropdown=$('sortDrop');

    if(sortOpen){
        dropdown.classList.add('open');
        const rect=$('sortBtn').getBoundingClientRect();
        dropdown.style.top=(rect.bottom + 6)+'px';
        dropdown.style.right=(window.innerWidth-rect.right)+'px';
        dropdown.style.left='auto';
    }
    else {
        dropdown.classList.remove('open');
    }
}


function bindEvents(){

    $$('.nav-btn[data-view]').forEach(btn=>{
        btn.addEventListener('click', ()=>setView(btn.dataset.view));
    });

    $('addTodoBtn').addEventListener('click', ()=>openTodoModal());
    $('emptyAddBtn').addEventListener('click', ()=>openTodoModal());

    $('modalClose').addEventListener('click',  () => closeModal('todoModal'));
    $('modalCancel').addEventListener('click', () => closeModal('todoModal'));
    $('modalSave').addEventListener('click', saveTodo);
    $('todoTitle').addEventListener('keydown', e => { if(e.key === 'Enter') saveTodo(); });

    $('addCiBtn').addEventListener('click', () => {
        const value = $('ciInput').value.trim();
        if(!value) return;
        checklist.push({ text: value, done: false });
        $('ciInput').value = '';
        renderChecklist();
    });

    $('ciInput').addEventListener('keydown', e => {
        if(e.key === 'Enter') { e.preventDefault(); $('addCiBtn').click(); }
    });

    $('addProjectBtn').addEventListener('click', openProjectModal);
    $('projModalClose').addEventListener('click',  () => closeModal('projectModal'));
    $('projModalCancel').addEventListener('click', () => closeModal('projectModal'));

    $('projModalSave').addEventListener('click', () => {
        const name = $('projName').value.trim();
        if(!name) {
            $('projName').classList.add('invalid');
            $('projNameErr').classList.add('show');
            return;
        }
        const project = Projects.add(name, selColor);
        closeModal('projectModal');
        renderProjects();
        toast(`"${project.name}" created!`, 'success');
    });

    $$('.color-swatch').forEach(swatch=>{
        swatch.addEventListener('click', ()=>{
            selColor=swatch.dataset.color;
            $$('.color-swatch').forEach(s=>s.classList.toggle('selected', s===swatch));
        });
    });

    $('detailClose').addEventListener('click',     ()=>closeModal('detailModal'));
    $('detailEditBtn').addEventListener('click',   ()=>{closeModal('detailModal'); openTodoModal(detailId);});
    $('detailDeleteBtn').addEventListener('click', ()=>{
        if(!confirm('Delete this task?')) return;
        Todos.del(detailId);
        closeModal('detailModal');
        renderTodos();
        toast('Task deleted.');
    });

    $('sortBtn').addEventListener('click', toggleSort);

    $$('.sort-opt').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            currentSort = btn.dataset.sort;
            $$('.sort-opt').forEach(b=>b.classList.toggle('active', b===btn));
            sortOpen=false;
            $('sortDrop').classList.remove('open');
            renderTodos();
        });
    });

    $$('.filter-chip').forEach(chip=>{
        chip.addEventListener('click', ()=>{
            currentPF = chip.dataset.pf;
            $$('.filter-chip').forEach(c=>c.classList.toggle('active', c===chip));
            renderTodos();
        });
    });

    $('hamburger').addEventListener('click', openSidebar);
    $('sidebarToggle').addEventListener('click', closeSidebar);
    $('sidebarOverlay').addEventListener('click', closeSidebar);

    $$('.modal-overlay').forEach(modal=>{
        modal.addEventListener('click', e=>{ 
          if(e.target===modal) modal.classList.remove('open'); });
    });

    document.addEventListener('keydown', e=>{
        if(e.key==='Escape'){
            $$('.modal-overlay').forEach(m=>m.classList.remove('open'));
            sortOpen=false;
            $('sortDrop').classList.remove('open');
        }
    });

    document.addEventListener('click', e=>{
        if(sortOpen && !e.target.closest('#sortDrop') && !e.target.closest('#sortBtn')){
            sortOpen=false;
            $('sortDrop').classList.remove('open');
        }
    });
}


document.addEventListener('DOMContentLoaded', ()=>{
    Projects.init();
    Todos.init();
    bindEvents();
    setView('all');
});
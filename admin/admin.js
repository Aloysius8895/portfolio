const $ = id => document.getElementById(id), form = $('project-form');
const fields = ['github', 'name', 'slug', 'synopsis', 'intro', 'category', 'pitch', 'stack', 'demo', 'context', 'role', 'team', 'quote', 'features'];
const state = { session: null, snapshot: null, project: null, artwork: null, artReady: false, dirty: false, reviewed: false, preview: '', importTicket: '', busy: false, imageGeneration: 0, operation: null };
function error(message = '', status) {
  $('error').textContent = message; $('error').hidden = !message;
  if (status === 409) { const button = el('button', 'Review latest changes ↻', 'text-button'); button.addEventListener('click', () => action(mergeLatest)); $('error').append(' ', button); }
}
function notice(message, kind = '') { $('notice').textContent = message; $('notice').className = `notice ${kind}`; $('notice').hidden = !message; }
async function api(route, body) {
  const response = await fetch(`/api/admin/${route}`, { credentials: 'same-origin', cache: 'no-store', method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': state.session?.csrf || '' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const reason = Error(result.error || `The request failed (${response.status}).`); reason.status = response.status; throw reason; }
  return result;
}
function busy(value) {
  state.busy = value; document.body.classList.toggle('busy', value);
  document.querySelectorAll('button').forEach(button => { button.disabled = value; });
  form.querySelectorAll('input,textarea,select').forEach(control => { control.disabled = value; });
  if (!value) { $('publish').disabled = !state.session?.canPublish; $('preview-publish').disabled = !state.session?.canPublish; }
}
async function action(callback) { if (state.busy) return; error(); busy(true); try { return await callback(); } catch (reason) { error(reason.message, reason.status); } finally { busy(false); } }
function markDirty() { state.dirty = true; state.reviewed = false; }
function el(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
const repository = project => project.github || (project.repo ? `https://github.com/${project.repo_owner || state.snapshot?.data.owner}/${project.repo}` : '');
function imageURL(project) {
  const published = state.snapshot.data.projects.find(item => item.slug === project.slug);
  return published?.disc === project.disc ? project.disc : `/api/admin/image?slug=${encodeURIComponent(project.slug)}&v=${state.snapshot.revision}`;
}
async function refresh(snapshot) {
  state.snapshot = snapshot || await api('projects');
  const all = new Map(state.snapshot.data.projects.map(project => [project.slug, project]));
  for (const [slug, project] of Object.entries(state.snapshot.drafts)) all.set(slug, project);
  const projects = [...all.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  $('count').textContent = `${projects.length} PROJECT${projects.length === 1 ? '' : 'S'} · ${state.snapshot.data.projects.length} PUBLISHED`;
  $('project-list').replaceChildren();
  for (const project of projects) {
    const row = el('article', '', 'project-row'), image = document.createElement('img');
    image.src = imageURL(project); image.alt = `${project.name} disk`; image.loading = 'lazy';
    const description = el('div'); description.append(el('h2', project.name), el('div', repository(project).replace('https://github.com/', ''), 'repository'));
    const draft = Object.hasOwn(state.snapshot.drafts, project.slug), published = state.snapshot.data.projects.some(item => item.slug === project.slug);
    const badge = el('span', draft ? published ? 'Unpublished changes' : 'Draft' : 'Published', `badge${draft ? ' draft' : ''}`);
    const date = el('span', project.created_at ? new Date(project.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '', 'project-date');
    const edit = el('button', 'Edit ↗', 'text-button'); edit.addEventListener('click', () => openProject(project));
    row.append(image, description, date, badge, edit); $('project-list').append(row);
  }
}
function fill(project) {
  for (const key of fields) {
    let value = project[key] || '';
    if (key === 'github') value = repository(project);
    if (key === 'stack') value = (project.stack || []).join(', ');
    if (key === 'features') value = (project.features || []).map(row => row.join(' | ')).join('\n');
    form.elements[key].value = value;
  }
  $('created-date').textContent = project.created_at ? `Repository created ${new Date(project.created_at).toISOString().slice(0, 10)} · this determines the disk order.` : '';
}
function currentProject() {
  const project = Object.fromEntries(fields.map(key => [key, form.elements[key].value.trim()]));
  project.stack = project.stack.split(',').map(tag => tag.trim()).filter(Boolean);
  project.features = project.features.split('\n').filter(line => line.trim()).map(line => { const at = line.indexOf('|'); if (at < 1) throw Error('Each feature needs a title and a description separated by |.'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; });
  return project;
}
async function mergeLatest() {
  const latest = await api('projects'), edited = currentProject(), original = state.project;
  if (!original) { await refresh(latest); notice('Latest project list loaded. Choose an unused slug or open the existing project to edit it.'); return; }
  const next = latest.drafts[original.slug] || latest.data.projects.find(project => project.slug === original.slug);
  if (!next) throw Error('This project was removed. Your text remains in the editor; copy it before creating a replacement.');
  const value = (p, key) => key === 'github' ? repository(p) : p[key] ?? (['stack', 'features'].includes(key) ? [] : '');
  const changed = fields.filter(key => JSON.stringify(edited[key]) !== JSON.stringify(value(original, key)));
  const conflicts = changed.filter(key => JSON.stringify(value(next, key)) !== JSON.stringify(value(original, key)) && JSON.stringify(value(next, key)) !== JSON.stringify(edited[key]));
  if (state.artwork && next.disc !== original.disc) conflicts.push('disk image');
  if (conflicts.length && !confirm(`These fields also changed elsewhere: ${conflicts.join(', ')}. Keep your edited values for these fields? Other changes will be preserved.`)) return;
  const merged = { ...next }; for (const key of changed) merged[key] = edited[key];
  await refresh(latest); state.project = next; fill(merged); markDirty();
  if (!state.artwork) { state.preview = imageURL(next); $('texture').src = state.preview; state.artReady = true; }
  notice('Latest revision loaded. Your edited fields have been retained. Review the merged project before saving.');
}
function openProject(project = null) {
  if (state.dirty && !confirm('Discard the changes in this editor?')) return;
  error(); state.project = project; state.artwork = null; state.artReady = !!project?.disc; state.dirty = false; state.reviewed = false; state.importTicket = ''; state.imageGeneration++;
  state.preview = project?.disc ? imageURL(project) : '';
  form.reset(); fill(project || { github: '', category: 'Software' });
  form.elements.slug.readOnly = !!project;
  $('editor-title').textContent = project ? 'Refine your project.' : 'Add a project.';
  $('editor-status').textContent = project ? Object.hasOwn(state.snapshot.drafts, project.slug) ? 'DRAFT' : 'PUBLISHED' : 'NEW PROJECT';
  $('texture').src = state.preview; $('texture').hidden = !state.preview; $('empty-art').hidden = !!state.preview;
  $('image-adjustments').hidden = true; $('file-name').textContent = ''; $('readme-wrap').hidden = true; $('manual-outline').hidden = true;
  $('adjust-saved').hidden = !project?.artwork?.source;
  $('unpublish').hidden = !state.session.canPublish || !state.snapshot.data.projects.some(item => item.slug === project?.slug);
  $('save-hint').textContent = state.session.mode === 'local' ? 'Local drafts stay on this computer.' : 'Save a draft until it feels ready.';
  $('listing').hidden = true; $('editor').hidden = false; window.scrollTo(0, 0); $('github').focus();
}
function calibration() {
  return { mode: $('fit-mode').value, zoom: Number($('art-zoom').value), rotation: Number($('art-rotation').value), x: Number($('art-x').value), y: Number($('art-y').value),
    outline: Object.fromEntries(['x', 'y', 'rx', 'ry', 'angle', 'hx', 'hy'].map(key => [key, Number($(`outline-${key}`).value)])) };
}
async function updateArtwork() {
  if (!state.artwork) return;
  const generation = ++state.imageGeneration; state.artReady = false;
  state.artwork.calibration = calibration();
  const result = await api('artwork', state.artwork);
  if (generation !== state.imageGeneration) return;
  state.preview = result.preview; state.artReady = true; $('texture').src = state.preview; $('texture').hidden = false; $('empty-art').hidden = true;
  $('file-name').textContent = 'Disk preview ready. Review the outline and center hole.';
}
function previewProject() {
  if (!form.reportValidity()) return false;
  if (!state.artReady) { error('Choose an image and update the disk preview before continuing.'); return false; }
  try {
    const project = currentProject(); $('preview-art').src = state.preview;
    $('preview-name').textContent = project.name; $('preview-category').textContent = project.category || 'Software';
    $('preview-description').textContent = project.synopsis; $('preview-stack').textContent = project.stack.join(' · ');
    $('preview-date').textContent = $('created-date').textContent; $('preview-publish').hidden = !state.session.canPublish;
    state.reviewed = true; $('project-preview').showModal(); return true;
  } catch (reason) { error(reason.message); return false; }
}
function deploymentMessage(result) {
  const messages = { pending: 'Saved to GitHub. Vercel is preparing the website update.', live: 'Your website update is live.', failed: 'Saved to GitHub, but deployment failed. The previous live website is still available.', draft: 'Draft saved on this computer. The public portfolio is unchanged.' };
  notice(messages[result.state] || 'Draft saved. The public project content is unchanged.', result.mode === 'local' ? 'local' : '');
  if (result.mode === 'github') {
    const label = el('span', ' Draft content is not added to the public collection until you publish.');
    if (state.operation?.action === 'draft') $('notice').append(label);
    if (result.commit) { const link = el('a', 'View saved revision ↗'); link.href = result.commit; link.target = '_blank'; link.rel = 'noopener'; $('notice').append(link); }
    const check = el('button', 'Check deployment ↻', 'text-button'); check.addEventListener('click', () => action(async () => {
      const latest = await api(`deployment?sha=${encodeURIComponent(result.revision)}`); deploymentMessage({ ...result, ...latest });
    })); $('notice').append(check);
  }
}
form.addEventListener('input', markDirty);
$('image-adjustments').addEventListener('input', () => { state.imageGeneration++; state.artReady = false; markDirty(); $('file-name').textContent = 'Artwork settings changed. Update the disk preview before saving.'; });
$('fit-mode').addEventListener('change', () => { $('manual-outline').hidden = $('fit-mode').value !== 'manual'; });
$('add').addEventListener('click', () => openProject());
$('back').addEventListener('click', () => { if (!state.dirty || confirm('Discard unsaved changes?')) { state.dirty = false; $('editor').hidden = true; $('listing').hidden = false; error(); window.scrollTo(0, 0); } });
$('import').addEventListener('click', () => action(async () => {
  const imported = await api('import', { url: $('github').value });
  if (state.project) { const current = currentProject(); for (const key of fields) if (current[key]?.length) imported[key] = current[key]; imported.slug = state.project.slug; }
  fill(imported); state.importTicket = imported.importTicket; markDirty();
  $('readme').textContent = imported.reference || 'No README is available.'; $('readme-wrap').hidden = false;
  notice('Repository imported. Review the description, then add your disk image.');
}));
$('image-file').addEventListener('change', () => action(async () => {
  const file = $('image-file').files[0]; if (!file) return;
  if (file.size > 3_000_000) throw Error('Choose a disk image no larger than 3 MB.');
  const dataURL = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  state.artwork = { data: String(dataURL).split(',')[1], calibration: calibration() }; state.artReady = false; markDirty();
  $('original').src = dataURL; $('image-adjustments').hidden = false; $('file-name').textContent = file.name;
  await updateArtwork();
}));
$('update-art').addEventListener('click', () => action(updateArtwork));
$('adjust-saved').addEventListener('click', () => action(async () => {
  const source = await api(`source?slug=${encodeURIComponent(state.project.slug)}`), saved = state.project.artwork.calibration || {};
  $('fit-mode').value = saved.mode || 'auto';
  for (const key of ['zoom', 'rotation', 'x', 'y']) $(`art-${key}`).value = saved[key] ?? (key === 'zoom' ? 1 : 0);
  for (const [key, value] of Object.entries(saved.outline || {})) if ($(`outline-${key}`)) $(`outline-${key}`).value = value;
  state.artwork = { data: source.data, calibration: saved }; $('original').src = `data:${source.mime};base64,${source.data}`;
  $('image-adjustments').hidden = false; $('manual-outline').hidden = saved.mode !== 'manual'; $('adjust-saved').hidden = true;
}));
$('github').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('import').click(); } });
$('preview').addEventListener('click', previewProject);
$('close-preview').addEventListener('click', () => $('project-preview').close());
$('preview-publish').addEventListener('click', () => { $('project-preview').close(); form.requestSubmit($('publish')); });
form.addEventListener('submit', event => {
  event.preventDefault(); const requested = event.submitter?.value || 'draft';
  if (requested === 'publish' && !state.reviewed) { previewProject(); return; }
  action(async () => {
    if (!state.artReady) throw Error('Update the disk preview before saving.');
    const project = currentProject(); state.operation = { action: requested };
    const result = await api('save', { revision: state.snapshot.revision, existingSlug: state.project?.slug || null, action: requested, project, artwork: state.artwork, importTicket: state.importTicket });
    state.dirty = false; await refresh();
    const saved = state.snapshot.drafts[project.slug] || state.snapshot.data.projects.find(item => item.slug === project.slug);
    openProject(saved); deploymentMessage(result);
  });
});
$('unpublish').addEventListener('click', () => { if (!confirm(state.dirty ? 'Unpublish this project? It will remain a draft, but unsaved editor changes will be discarded. Save your draft first if needed.' : 'Unpublish this project? It will remain saved as a draft.')) return; action(async () => {
  state.operation = { action: 'unpublish' }; const result = await api('unpublish', { slug: state.project.slug, revision: state.snapshot.revision });
  state.dirty = false; await refresh(); openProject(state.snapshot.drafts[state.project.slug]); deploymentMessage(result);
}); });
$('logout').addEventListener('click', () => { if (state.dirty && !confirm('Sign out and discard unsaved changes?')) return; action(async () => { await api('logout', {}); state.dirty = false; location.reload(); }); });
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
await action(async () => {
  state.session = await api('session');
  if (!state.session.authenticated) {
    $('gate').hidden = false;
    if (state.session.mode === 'setup') { $('gate-message').textContent = 'Online publishing is not connected yet. Follow the deployment setup in the project documentation.'; $('login').hidden = true; }
    return;
  }
  $('workspace').hidden = false; $('identity').textContent = state.session.user.login; $('logout').hidden = state.session.mode === 'local';
  if (state.session.mode === 'local') notice('Local draft studio · Changes stay on this computer. Connect GitHub and Vercel to publish online.', 'local');
  await refresh();
});

const host = document.querySelector('#season-news');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let paused = false, lastPayload = '';
const formatDate = value => new Date(value).toLocaleDateString('en-GB', {day:'numeric',month:'short'});

function validStory(story) {
  try {
    const url = new URL(story.url);
    return url.protocol === 'https:' && typeof story.title === 'string' && typeof story.source === 'string' && Number.isFinite(Date.parse(story.publishedAt));
  } catch { return false; }
}

function paint(payload) {
  const stories = payload.stories?.filter(validStory).slice(0,6);
  if (!stories?.length || !Number.isFinite(Date.parse(payload.checkedAt))) throw Error('Invalid news feed');
  const expanded = host.querySelector('details')?.open || false;
  const stale = Date.now() - Date.parse(payload.checkedAt) > 48 * 3600 * 1000;
  const label = `${stale ? 'Last checked' : 'Updated'} ${formatDate(payload.checkedAt)}`;
  const storyMarkup = stories.map(story => `<a href="${escape(story.url)}" target="_blank" rel="noopener noreferrer" tabindex="-1"><span class="news-source">${escape(story.source)}</span>${escape(story.title)}<span class="news-divider" aria-hidden="true">✧</span></a>`).join('');
  host.hidden = false;
  host.className = `season-news${paused ? ' is-paused' : ''}`;
  host.innerHTML = `<div class="news-bar"><span class="news-label"><span aria-hidden="true" class="news-signal"></span>Castle dispatch</span><div class="news-window" aria-hidden="true"><div class="news-track"><div class="news-group">${storyMarkup}</div><div class="news-group" inert>${storyMarkup}</div></div></div><button class="news-pause" type="button" aria-label="${paused?'Resume':'Pause'} news ticker" aria-pressed="${paused}">${paused?'▶':'Ⅱ'}</button></div><details class="news-details" ${expanded?'open':''}><summary>Top season stories <span>${escape(label)} · Automatic updates</span></summary><ul>${stories.map(story=>`<li><a href="${escape(story.url)}" target="_blank" rel="noopener noreferrer">${escape(story.title)} <span aria-hidden="true">↗</span></a><small>${escape(story.source)} · <time datetime="${escape(story.publishedAt)}">${formatDate(story.publishedAt)}</time></small></li>`).join('')}</ul><p>Recent coverage from selected publishers via Google News. Headlines may contain spoilers. ${stale?'The last successful update is over two days old. Showing cached stories.':'Checked every six hours.'}</p></details>`;
  host.querySelector('.news-pause').addEventListener('click', () => {
    paused = !paused;
    host.classList.toggle('is-paused', paused);
    const button = host.querySelector('.news-pause');
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', `${paused ? 'Resume' : 'Pause'} news ticker`);
    button.textContent = paused ? '▶' : 'Ⅱ';
  });
}

async function refreshNews() {
  try {
    const response = await fetch('./news.json', {cache:'no-cache'});
    if (!response.ok) throw Error('News unavailable');
    const payload = await response.json();
    // Repaint only when the content or freshness label changes; never interrupt reading.
    const signature = JSON.stringify(payload) + String(Date.now() - Date.parse(payload.checkedAt) > 48 * 3600 * 1000);
    if (signature !== lastPayload) { paint(payload); lastPayload = signature; }
  } catch {
    if (!lastPayload) {
      host.hidden = false;
      host.className = 'season-news news-unavailable';
      host.textContent = 'Castle dispatch · Season news is temporarily unavailable.';
    }
  }
}

await refreshNews();
setInterval(() => { if (!document.hidden) refreshNews(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNews(); });

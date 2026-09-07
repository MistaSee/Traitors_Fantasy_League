// Compare the current form with its saved state, including changes later undone.
export class EditTracker {
  #sections = new Map();

  track(id, label, read, write) {
    this.#sections.set(id, {label, read, write, saved: JSON.stringify(read())});
  }

  changed({only, except} = {}) {
    return [...this.#sections.entries()]
      .filter(([id, section]) => (!only || only.includes(id)) && id !== except &&
        JSON.stringify(section.read()) !== section.saved)
      .map(([id, {label}]) => ({id, label}));
  }

  pending(options) {
    return this.changed(options).map(({id}) => {
      const section = this.#sections.get(id);
      return {id, saved: JSON.parse(section.saved), values: structuredClone(section.read())};
    });
  }

  restore(pending) {
    for (const {id, saved, values} of pending) this.#sections.get(id)?.write?.(values, saved);
  }

  clear() { this.#sections.clear(); }
}

const fields = form => [...form.querySelectorAll('input, select, textarea')]
  .filter(el => !el.hasAttribute('data-navigation'));

export function readForm(form) {
  return fields(form).map(el => el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value);
}

export function restoreForm(form, values, saved) {
  fields(form).forEach((el, i) => {
    if (values[i] === saved[i]) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = values[i];
    else el.value = values[i];
  });
}

// A DOM dialog keeps the choice keyboard accessible and makes the affected
// sections explicit. Escape, like Keep editing, always cancels the action.
export function confirmDiscard(sections) {
  if (!sections.length) return Promise.resolve(true);
  const dialog = document.createElement('dialog');
  dialog.className = 'edit-warning';
  dialog.setAttribute('aria-labelledby', 'edit-warning-title');
  dialog.setAttribute('aria-describedby', 'edit-warning-description');
  dialog.innerHTML = '<h2 id="edit-warning-title">Unsaved changes</h2><p id="edit-warning-description"></p><div class="row"><button type="button" autofocus>Keep editing</button><button type="button" class="primary"></button></div>';
  dialog.querySelector('p').textContent = `You have unsaved changes in ${sections.map(s => s.label).join(', ')}. Discard them and continue?`;
  const [stay, discard] = dialog.querySelectorAll('button');
  discard.textContent = 'Discard changes';
  document.body.append(dialog);
  return new Promise(resolve => {
    stay.onclick = () => dialog.close();
    discard.onclick = () => dialog.close('discard');
    dialog.addEventListener('close', () => {
      const approved = dialog.returnValue === 'discard';
      dialog.remove();
      resolve(approved);
    }, {once: true});
    dialog.showModal();
  });
}

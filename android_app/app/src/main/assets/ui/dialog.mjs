// The dialog owns its form lifecycle. Callers supply form markup and save
// callbacks, and resolve focus targets in their own (possibly rerendered) view.
export function guardAgainstRepeatClick(event) {
  if (!event.detail) return;
  const document = event.target.ownerDocument;
  const {clientX,clientY} = event;
  let lastPress = event.timeStamp;
  const ignoreRepeat = repeat => {
    // Chromium can reset the click count during a rapid series of touch taps.
    const atSamePoint = Math.hypot(repeat.clientX-clientX,repeat.clientY-clientY) <= 6;
    const inSameBurst = repeat.timeStamp-lastPress < 450;
    const repeatsActivation = repeat.detail > 1 || (repeat.detail === 1 && atSamePoint && inSameBurst);
    if (!repeatsActivation) {
      document.removeEventListener('mousedown', ignoreRepeat, true);
      document.removeEventListener('click', ignoreRepeat, true);
      return;
    }
    lastPress = repeat.timeStamp;
    repeat.preventDefault();
    repeat.stopImmediatePropagation();
  };
  document.addEventListener('mousedown', ignoreRepeat, true);
  document.addEventListener('click', ignoreRepeat, true);
}

export function createDialog(dialog, {captureOpener, restoreFocus}) {
  const form = dialog.querySelector('form');
  const title = dialog.querySelector('#dialog-title');
  const fields = dialog.querySelector('#fields');
  const error = dialog.querySelector('#form-error');
  const dismiss = dialog.querySelector('#close');
  const submit = dialog.querySelector('#submit');
  let opener;
  let save;
  let saving = false;

  function open(heading, html, onSubmit, label = 'Kaydet', target = captureOpener()) {
    const replacing = dialog.open;
    if (!replacing) opener = target;
    save = onSubmit;
    title.textContent = heading;
    fields.innerHTML = html;
    error.textContent = '';
    submit.textContent = label;
    submit.hidden = !onSubmit;
    if (!replacing) dialog.showModal();
    dialog.scrollTop = 0;
    title.focus({preventScroll:true});
  }

  function close() {
    if (!dialog.open) return false;
    const target = opener;
    opener = save = null;
    dialog.close();
    restoreFocus(target);
    return true;
  }

  function showError(message) {
    error.textContent = message;
    error.focus();
  }

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dismiss.addEventListener('click', close);
  // A save can close the dialog before a second click reaches the same point.
  // Catch both the focus-changing press and the click on the revealed page.
  submit.addEventListener('click', guardAgainstRepeatClick);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!dialog.open || !save || saving) return;
    saving = true;
    try {
      save(new FormData(form));
      close();
    } catch (failure) {
      showError(failure.message);
    } finally {
      saving = false;
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = dialog.ownerDocument.activeElement;
    const last = submit.hidden
      ? [...fields.querySelectorAll('button:not([hidden]):enabled')].at(-1) ?? dismiss
      : submit;
    if (event.shiftKey && (focused === dismiss || focused === title)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (focused === last || (submit.hidden && focused === error))) {
      event.preventDefault();
      dismiss.focus();
    }
  });

  return {open, close, showError};
}

// The dialog owns its form lifecycle. Callers supply form markup and save
// callbacks, and resolve focus targets in their own (possibly rerendered) view.
export function createDialog(dialog, {captureOpener, restoreFocus}) {
  const form = dialog.querySelector('form');
  const title = dialog.querySelector('#dialog-title');
  const fields = dialog.querySelector('#fields');
  const error = dialog.querySelector('#form-error');
  const dismiss = dialog.querySelector('#close');
  const submit = dialog.querySelector('#submit');
  let opener;
  let save;

  function open(heading, html, onSubmit, label = 'Kaydet', target = captureOpener()) {
    const replacing = dialog.open;
    if (!replacing) opener = target;
    save = onSubmit;
    title.textContent = heading;
    fields.innerHTML = html;
    error.textContent = '';
    submit.textContent = label;
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

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dismiss.addEventListener('click', close);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!dialog.open) return;
    try {
      save(new FormData(form));
      close();
    } catch (failure) {
      error.textContent = failure.message;
      error.focus();
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = dialog.ownerDocument.activeElement;
    // Close and submit bound the form's native tab order.
    if (event.shiftKey && (focused === dismiss || focused === title)) {
      event.preventDefault();
      submit.focus();
    } else if (!event.shiftKey && focused === submit) {
      event.preventDefault();
      dismiss.focus();
    }
  });

  return {open, close};
}

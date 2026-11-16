// ============================================
// NOTESTREAM - DIALOG
// A question or a message in the game's own look, in place of the browser's confirm()
// and alert(). Styled by dialog.css. Used by the new start page, the new lobby and the game.
//
//   NotestreamDialog.confirm({ title, text, confirmLabel, cancelLabel, danger })
//     -> Promise<boolean>: true when the user confirms, false on cancel, Escape or a
//        click outside the box
//   NotestreamDialog.message({ title, text, buttonLabel })
//     -> Promise that resolves when the box is closed
//
// Both promises have a dismiss() method that takes the box away as cancelled, for when
// the question no longer applies.
// ============================================

(function (root) {
  "use strict";

  // One dialog at a time: the next one waits until the one before it has been closed
  let queue = Promise.resolve();
  let nextId = 1;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // entry.close is set while the box is on screen, so that dismiss() can close it
  function open(options, entry) {
    return new Promise(resolve => {
      const isQuestion = options.kind === "confirm";
      const previousFocus = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      const id = "nsDialog" + nextId++;

      const overlay = element("div", "ns-dialog-overlay");
      const panel = element("div", "ns-dialog");
      panel.setAttribute("role", isQuestion ? "alertdialog" : "dialog");
      panel.setAttribute("aria-modal", "true");

      // The text comes from the caller and can hold names from the database, so it is
      // always set as text and never as HTML
      if (options.title) {
        const title = element("div", "ns-dialog-title", String(options.title));
        title.id = id + "Title";
        panel.setAttribute("aria-labelledby", title.id);
        panel.appendChild(title);
      }
      if (options.text) {
        const text = element("div", "ns-dialog-text", String(options.text));
        text.id = id + "Text";
        panel.setAttribute("aria-describedby", text.id);
        panel.appendChild(text);
      }

      const buttons = element("div", "ns-dialog-buttons");
      let closed = false;
      const close = answer => {
        if (closed) return;
        closed = true;
        entry.close = null;
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
        resolve(answer);
      };

      let cancelButton = null;
      if (isQuestion) {
        cancelButton = element("button", "ns-dialog-btn secondary", options.cancelLabel || "Avbryt");
        cancelButton.type = "button";
        cancelButton.addEventListener("click", () => close(false));
        buttons.appendChild(cancelButton);
      }
      const confirmLabel = isQuestion ? (options.confirmLabel || "OK") : (options.buttonLabel || "OK");
      const confirmButton = element("button", "ns-dialog-btn " + (options.danger ? "danger" : "primary"), confirmLabel);
      confirmButton.type = "button";
      confirmButton.addEventListener("click", () => close(true));
      buttons.appendChild(confirmButton);
      panel.appendChild(buttons);
      overlay.appendChild(panel);

      // A click beside the box is the same as cancelling
      overlay.addEventListener("click", event => {
        if (event.target === overlay) close(false);
      });

      function onKey(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          close(false);
        } else if (event.key === "Tab") {
          // Keep the focus on the buttons of the box
          const focusable = cancelButton ? [cancelButton, confirmButton] : [confirmButton];
          const index = focusable.indexOf(document.activeElement);
          const step = event.shiftKey ? -1 : 1;
          const next = focusable[(index + step + focusable.length) % focusable.length];
          event.preventDefault();
          next.focus();
        }
      }
      document.addEventListener("keydown", onKey, true);

      entry.close = close;
      document.body.style.overflow = "hidden";
      document.body.appendChild(overlay);
      // Enter on a question that removes something should not confirm it by accident
      (options.danger && cancelButton ? cancelButton : confirmButton).focus();
    });
  }

  // Returns the answer and a way to take the box away from code: dismiss() closes it as
  // cancelled if it is on screen, and keeps it from opening if it is still waiting its turn
  function enqueue(options) {
    const entry = { cancelled: false, close: null };
    const answer = queue.then(() => (entry.cancelled ? false : open(options, entry)));
    queue = answer.then(() => undefined, () => undefined);
    const dismiss = () => {
      entry.cancelled = true;
      if (entry.close) entry.close(false);
    };
    return { answer, dismiss };
  }

  root.NotestreamDialog = {
    confirm(options) {
      const { answer, dismiss } = enqueue({ ...options, kind: "confirm" });
      const result = answer.then(value => value === true);
      result.dismiss = dismiss;
      return result;
    },
    message(options) {
      const { answer, dismiss } = enqueue({ ...options, kind: "message" });
      const result = answer.then(() => undefined);
      result.dismiss = dismiss;
      return result;
    }
  };
})(window);

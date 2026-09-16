const pickerTypes = new Set(["date", "datetime-local", "time", "month", "week"]);

/** Delegation also covers inputs mounted later, including portals and dialogs. */
export function installDatePickerClick(targetDocument: Document = document) {
  function openPicker(event: MouseEvent) {
    const input = event.target;
    if (event.defaultPrevented || !(input instanceof HTMLInputElement) || !pickerTypes.has(input.type)) return;
    if (input.matches(":disabled") || input.readOnly || input.dataset.pickerOnClick === "false" || typeof input.showPicker !== "function") return;
    try {
      input.focus({ preventScroll: true });
      // Keep this synchronous: native pickers require a user activation.
      input.showPicker();
      // Avoid a second native icon action closing the picker we just opened.
      event.preventDefault();
    } catch {
      // Unsupported contexts retain the browser's normal editing and icon behavior.
    }
  }
  targetDocument.addEventListener("click", openPicker);
  return () => targetDocument.removeEventListener("click", openPicker);
}

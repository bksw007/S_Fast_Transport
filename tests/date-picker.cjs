const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
class Input {
  constructor(type) { this.type = type; this.dataset = {}; this.opens = 0; }
  matches() { return !!this.disabled; }
  focus() { this.focused = true; }
  showPicker() { this.opens++; }
}
const listeners = new Set();
const document = { addEventListener: (name, fn) => listeners.add(fn), removeEventListener: (name, fn) => listeners.delete(fn) };
const context = { exports: {}, document, HTMLInputElement: Input };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/date-picker.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const stop = context.exports.installDatePickerClick();
function click(target, defaultPrevented = false) { const event = { target, defaultPrevented, preventDefault() { this.defaultPrevented = true; } }; for (const listener of listeners) listener(event); return event; }
for (const type of ['date', 'datetime-local', 'time', 'month', 'week']) {
  const input = new Input(type); assert.equal(click(input).defaultPrevented, true); assert.equal(input.opens, 1); assert.equal(input.focused, true);
}
for (const overrides of [{ disabled: true }, { readOnly: true }, { type: 'text' }, { dataset: { pickerOnClick: 'false' } }]) {
  const input = Object.assign(new Input('date'), overrides); assert.equal(click(input).defaultPrevented, false); assert.equal(input.opens, 0);
}
const unsupported = new Input('date'); unsupported.showPicker = undefined; assert.equal(click(unsupported).defaultPrevented, false);
const denied = new Input('date'); denied.showPicker = () => { throw new Error('NotAllowedError'); }; assert.equal(click(denied).defaultPrevented, false);
const cancelled = new Input('date'); click(cancelled, true); assert.equal(cancelled.opens, 0);
assert.doesNotThrow(() => click({ tagName: 'LABEL' }));
stop(); assert.equal(listeners.size, 0);
const lateInput = new Input('date'); const stopAgain = context.exports.installDatePickerClick(); click(lateInput); assert.equal(lateInput.opens, 1); stopAgain();
console.log('PASS: all date/time types, dynamic inputs, disabled/read-only, opt-out, fallback and listener cleanup');

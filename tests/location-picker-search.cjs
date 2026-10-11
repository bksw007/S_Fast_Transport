const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const locations = [
  { id: 'a', name: 'คลังสินค้า บางนา', active: true, lat: 13, lng: 100 },
  { id: 'b', name: 'ท่าเรือ คลองเตย', active: true, lat: 14, lng: 101 },
  { id: 'c', name: 'สถานที่ปิด', active: false, lat: 15, lng: 102 }
];
const storage = new Map();
let slots = [], cursor = 0, changed;
const context = { React, exports: {}, window: { localStorage: {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value)
} }, require: name => {
  if (name === 'react') return {
    useEffect: () => {}, useId: () => 'location-list', useRef: () => ({ current: null }),
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; }
  };
  if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
  if (name === '@/lib/location-repository') return {
    subscribeSavedLocations: () => () => {},
    filterSavedLocations: (items, query) => items.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase())),
    selectSavedLocation: (id, items) => { const item = items.find(value => value.id === id && value.active); return item ? { name: item.name, place: { locationId: id, name: item.name, lat: item.lat, lng: item.lng } } : null; }
  };
  return require(name);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/app/components/LocationPicker.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);

let tree;
function render() { cursor = 0; tree = context.exports.LocationPicker({ value: '', title: 'รับงาน', organizationId: 'main', onChange: (name, place) => { changed = { name, place }; } }); }
function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function find(className) { const node = nodes().find(item => item.props?.className === className); assert.ok(node, `Missing ${className}`); return node; }
function optionNames() { return nodes().filter(item => item.props?.className === 'location-picker-option').map(item => React.Children.toArray(item.props.children).find(child => child?.type === 'span')?.props.children); }

slots[0] = locations;
render();
find('location-picker-trigger').props.onClick(); render();
assert.deepEqual(optionNames(), ['คลังสินค้า บางนา', 'ท่าเรือ คลองเตย'], 'inactive places are omitted');
find('location-picker-search').props.children[1].props.onChange({ target: { value: 'คลองเตย' } }); render();
assert.deepEqual(optionNames(), ['ท่าเรือ คลองเตย'], 'typing filters saved places');
let preventedSubmit = false;
find('location-picker-search').props.children[1].props.onKeyDown({ key: 'Enter', preventDefault: () => { preventedSubmit = true; } });
assert.equal(preventedSubmit, true, 'selecting with Enter must not submit the job form');
assert.equal(changed.name, 'ท่าเรือ คลองเตย');
assert.equal(changed.place.locationId, 'b', 'selection retains the saved map coordinates');
assert.deepEqual(JSON.parse(storage.get('sfast:recent-locations:main')), ['b']);
find('location-picker-trigger').props.onClick(); render();
assert.deepEqual(optionNames(), ['ท่าเรือ คลองเตย', 'คลังสินค้า บางนา'], 'recently used place appears first');
console.log('PASS: saved place search, active filtering, map selection and recent order');

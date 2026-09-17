const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const compile = text => ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
const shared = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('packages/shared/src/index.ts', 'utf8')), shared);
const source = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const code = file.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'SectionMenu' || ts.isVariableStatement(n) && /^const (adminMenuDetails|driverMenuDetails)/.test(n.getText(file))).map(n => n.getText(file)).join('\n');
let signedOut = false, selected, closed;
const context = { React, ...require('lucide-react'), ...shared.exports, auth: {}, signOut: () => { signedOut = true; }, isMainAdmin: profile => profile.role === 'admin' };
vm.runInNewContext(compile(code), context);
function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function menu(mode, role) { return nodes(context.SectionMenu({ open: true, mode, user: { email: 'test@example.com' }, profile: { role }, statusMessage: 'Ready', pendingAccessCount: 3, adminScreen: 'Dashboard', driverScreen: 'งานวันนี้', onNavigate: () => { closed = true; }, onAdminScreenChange: value => { selected = value; }, onDriverScreenChange: value => { selected = value; } })); }
let rendered = menu('admin', 'admin');
let links = rendered.filter(n => n.type === 'button' && n.props.title);
assert.equal(links.length, 13); // 12 navigation entries and sign out.
assert.equal(rendered.filter(n => n.props?.['aria-current'] === 'page').length, 1);
const transportGroup = rendered.find(n => n.type === 'section' && n.props?.['aria-label'] === 'งานขนส่ง');
assert.ok(nodes(transportGroup).some(n => n.props?.title === 'คลังชื่อ ลิงก์ และพิกัดแผนที่'));
links.find(n => n.props.title === 'สิทธิ์ Google Login').props.onClick();
assert.equal(selected, 'User Management'); assert.equal(closed, true);
rendered.find(n => n.props?.['aria-label'] === 'ออกจากระบบ').props.onClick(); assert.equal(signedOut, true);
rendered = menu('admin', 'subcontract_admin');
assert.ok(!rendered.some(n => n.props?.title === 'สิทธิ์ Google Login' || n.props?.title === 'ซับคอนแท็ค' || n.props?.title === 'ลูกค้าและลิงก์ติดตาม'));
rendered = menu('driver', 'driver');
assert.equal(rendered.filter(n => n.type === 'button' && n.props.title).length, 7);
rendered.find(n => n.props?.['aria-label'] === 'เปิดโปรไฟล์ของฉัน').props.onClick(); assert.equal(selected, 'โปรไฟล์');
console.log('PASS: sidebar preserves all role-specific destinations, active state, profile and sign out');

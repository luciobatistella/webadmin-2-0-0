const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node check_template_tags.cjs <file>'); process.exit(2); }
const src = fs.readFileSync(path, 'utf8');
const tm = src.match(/<template[\s\S]*?<\/template>/i);
if (!tm) { console.error('No <template> found'); process.exit(1); }
const tpl = tm[0];
const re = /<(\/)?([a-zA-Z0-9-]+)([^>]*)>/g;
const selfClosing = /\/(\s*)>$/;
const stack = [];
let m;
let index = 0;
while ((m = re.exec(tpl)) !== null) {
  const full = m[0];
  const closing = !!m[1];
  const tag = m[2];
  const attrs = m[3] || '';
  const pos = m.index;
  const line = tpl.slice(0, pos).split('\n').length;
  const col = pos - tpl.lastIndexOf('\n', pos - 1);
  const isSelf = selfClosing.test(full) || ['img','input','br','hr','meta','link'].includes(tag.toLowerCase()) || attrs.includes('/');
  if (closing) {
    if (stack.length === 0) {
      console.log(`UNEXPECTED_CLOSING ${tag} at line ${line} col ${col}`);
      process.exit(0);
    }
    const top = stack.pop();
    if (top.tag !== tag) {
      console.log(`MISMATCH closing </${tag}> at line ${line} col ${col}, expected </${top.tag}> for open at line ${top.line}`);
      process.exit(0);
    }
  } else if (!isSelf) {
    stack.push({ tag, line, col });
  }
}
if (stack.length) {
  const open = stack.pop();
  console.log(`UNclosed <${open.tag}> opened at line ${open.line} col ${open.col}`);
} else {
  console.log('All tags balanced (naive check)');
}
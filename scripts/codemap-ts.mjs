/**
 * TS/JS half of `scripts/codemap.py`: parses files one by one with `ts.createSourceFile`
 * (syntax only, no type-check program) and prints their outline as JSON on stdout.
 *
 * Input (stdin): `{"root": "<repo root>", "files": ["modules/x/src/a.ts", ...]}`.
 * Output: `{"<file>": {doc, symbols, imports}}`; import specifiers stay raw — resolving them to
 * repo paths is codemap.py's job. Deterministic: no timestamps, files in input order.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_SIG = 140;
const MAX_DOC = 120;

/** The mapped repo's `typescript`, else the one next to this script (synthetic test trees). */
function loadTypescript(root) {
  for (const base of [resolve(root, 'package.json'), import.meta.url]) {
    try {
      return createRequire(base)('typescript');
    } catch {
      // try the next location
    }
  }
  process.stderr.write('codemap-ts: devDependency `typescript` not found (run pnpm install)\n');
  process.exit(3);
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const squash = (text) => text.replace(/\s+/g, ' ').trim();

function firstLine(text) {
  for (const line of (text ?? '').split('\n')) {
    const t = line.trim();
    if (t) return clip(t, MAX_DOC);
  }
  return '';
}

export function outline(ts, fileName, text) {
  const kind = /\.tsx$/.test(fileName)
    ? ts.ScriptKind.TSX
    : /\.(m|c)?jsx?$/.test(fileName)
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const src = (node) => squash(text.slice(node.getStart(sf), node.getEnd()));

  const jsdoc = (node) => {
    const docs = (node.jsDoc ?? []).filter((d) => d.kind === ts.SyntaxKind.JSDoc);
    const last = docs[docs.length - 1];
    return last ? firstLine(ts.getTextOfJSDocComment(last.comment) ?? '') : '';
  };
  const params = (fn) => fn.parameters.map(src).join(', ');
  const ret = (fn) => (fn.type ? `: ${src(fn.type)}` : '');
  const sig = (s) => clip(s, MAX_SIG);
  const isExported = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  const isDefault = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Default) !== 0;

  const classMembers = (cls) => {
    const out = [];
    for (const m of cls.members) {
      const flags = ts.getCombinedModifierFlags(m);
      if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
      if (m.name && ts.isPrivateIdentifier(m.name)) continue;
      if (ts.isMethodDeclaration(m) && m.name) {
        out.push({
          name: m.name.getText(sf),
          sig: sig(`${m.name.getText(sf)}(${params(m)})${ret(m)}`),
          doc: jsdoc(m),
        });
      } else if (ts.isConstructorDeclaration(m) && m.parameters.length) {
        out.push({ name: 'constructor', sig: sig(`constructor(${params(m)})`), doc: jsdoc(m) });
      }
    }
    return out;
  };

  const symbols = [];
  const imports = new Set();
  let fileDoc = '';

  // File-level JSDoc: the first /** */ at the top, unless it is glued to a declaration
  // (no blank line before a non-import statement) — then it documents that declaration.
  const first = sf.statements[0];
  const ranges = ts.getLeadingCommentRanges(text, 0) ?? [];
  const firstDoc = ranges.find((r) => text.startsWith('/**', r.pos));
  if (firstDoc) {
    const between = first ? text.slice(firstDoc.end, first.getStart(sf)) : '';
    const glued = first && !ts.isImportDeclaration(first) && !/\n\s*\n/.test(between);
    const ownsNext = first && ranges[ranges.length - 1] !== firstDoc;
    if (!glued || ownsNext) {
      const body = text
        .slice(firstDoc.pos + 3, firstDoc.end - 2)
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join('\n');
      fileDoc = firstLine(body.replace(/^\s*@\w+.*$/gm, ''));
    }
  }

  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier) {
      if (ts.isStringLiteral(st.moduleSpecifier)) imports.add(st.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(st)) {
      const from =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? ` from '${st.moduleSpecifier.text}'`
          : '';
      const names = st.exportClause ? src(st.exportClause) : '*';
      symbols.push({
        kind: 'export',
        name: names,
        sig: sig(`export ${st.isTypeOnly ? 'type ' : ''}${names}${from}`),
        doc: '',
      });
      continue;
    }
    if (ts.isExportAssignment(st)) {
      symbols.push({
        kind: 'default',
        name: 'default',
        sig: sig(`export default ${src(st.expression)}`),
        doc: jsdoc(st),
      });
      continue;
    }
    if (!isExported(st)) continue;
    const dflt = isDefault(st) ? 'default ' : '';
    if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? 'default';
      symbols.push({
        kind: 'function',
        name,
        sig: sig(`${dflt}${name}(${params(st)})${ret(st)}`),
        doc: jsdoc(st),
      });
    } else if (ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? 'default';
      const heritage = (st.heritageClauses ?? []).map(src).join(' ');
      symbols.push({
        kind: 'class',
        name,
        sig: sig(`class ${dflt}${name}${heritage ? ` ${heritage}` : ''}`),
        doc: jsdoc(st),
        members: classMembers(st),
      });
    } else if (ts.isInterfaceDeclaration(st)) {
      symbols.push({
        kind: 'interface',
        name: st.name.text,
        sig: `interface ${st.name.text}`,
        doc: jsdoc(st),
      });
    } else if (ts.isTypeAliasDeclaration(st)) {
      symbols.push({
        kind: 'type',
        name: st.name.text,
        sig: `type ${st.name.text}`,
        doc: jsdoc(st),
      });
    } else if (ts.isEnumDeclaration(st)) {
      symbols.push({
        kind: 'enum',
        name: st.name.text,
        sig: `enum ${st.name.text}`,
        doc: jsdoc(st),
      });
    } else if (ts.isVariableStatement(st)) {
      const doc = jsdoc(st);
      for (const d of st.declarationList.declarations) {
        const name = d.name.getText(sf);
        let init = d.initializer;
        while (
          init &&
          (ts.isAsExpression(init) ||
            ts.isSatisfiesExpression(init) ||
            ts.isParenthesizedExpression(init))
        ) {
          init = init.expression;
        }
        let s;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          s = `${name}(${params(init)})${ret(init)}`;
        } else if (d.type) {
          s = `const ${name}: ${src(d.type)}`;
        } else {
          s = `const ${name}`;
        }
        symbols.push({ kind: 'const', name, sig: sig(s), doc });
      }
    }
  }

  // Dynamic `import('x')` anywhere in the file.
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { doc: fileDoc, symbols, imports: [...imports].sort() };
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const ts = loadTypescript(input.root);
  const result = {};
  for (const file of input.files) {
    const text = readFileSync(join(input.root, file), 'utf8');
    result[file] = outline(ts, file, text);
  }
  process.stdout.write(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

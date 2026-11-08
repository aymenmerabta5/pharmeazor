const { parseSync } = require("oxc-parser");
const path = require("node:path");

function toPosix(value) {
  return value.replaceAll("\\", "/");
}
function relative(file) {
  return toPosix(path.relative(process.cwd(), file));
}
function language(file) {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".jsx")) return "jsx";
  return undefined;
}
function parseOwned(file, source, lang = language(file)) {
  const result = parseSync(file, source, { sourceType: "module", lang });
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => error.message).join("; ");
    throw new Error(`Parser diagnostics in ${relative(file)}: ${details}`);
  }
  return result.program;
}
function walk(root, visit) {
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    visit(node);
    for (const [key, child] of Object.entries(node)) {
      if (["loc", "range", "start", "end"].includes(key)) continue;
      if (child && typeof child === "object") stack.push(child);
    }
  }
}
function stringValue(node) {
  return node && typeof node === "object" && typeof node.value === "string" ? node.value : null;
}
function sourceValue(node) {
  return stringValue(node?.source);
}
function positionOf(source, node) {
  const end = Number.isInteger(node?.start) ? node.start : 0;
  let line = 1;
  let column = 1;
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}
function importDeclarations(program) {
  const imports = [];
  walk(program, (node) => {
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      sourceValue(node)
    )
      imports.push(node);
  });
  return imports;
}
function moduleReferences(program) {
  const references = [];
  walk(program, (node) => {
    const declarationSource = sourceValue(node);
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      declarationSource
    )
      references.push({ node, specifier: declarationSource, kind: node.type });
    if (node.type === "ImportExpression") {
      const specifier = stringValue(node.source);
      if (specifier) references.push({ node, specifier, kind: "ImportExpression" });
    }
    if (node.type === "TSImportType") {
      const specifier = stringValue(node.source);
      if (specifier) references.push({ node, specifier, kind: "TSImportType" });
    }
    if (node.type === "CallExpression") {
      const first = node.arguments?.[0];
      const specifier = stringValue(first);
      const isRequire = node.callee?.type === "Identifier" && node.callee.name === "require";
      const isImport = node.callee?.type === "Import";
      if (specifier && (isRequire || isImport)) {
        references.push({ node, specifier, kind: isRequire ? "require" : "import()" });
      }
    }
  });
  return references;
}
function importedNames(node) {
  return (node.specifiers ?? [])
    .filter((specifier) => specifier.type === "ImportSpecifier")
    .map(
      (specifier) => specifier.imported?.name ?? specifier.imported?.value ?? specifier.local?.name,
    )
    .filter((name) => typeof name === "string");
}
function jsxName(node) {
  if (node?.type === "JSXIdentifier") return node.name;
  if (node?.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return null;
}
function jsxAttribute(opening, name) {
  return (
    (opening?.attributes ?? []).find(
      (attribute) => attribute.type === "JSXAttribute" && jsxName(attribute.name) === name,
    ) ?? null
  );
}
function jsxAttributeString(opening, name) {
  const attribute = jsxAttribute(opening, name);
  const value = attribute?.value;
  if (!value) return null;
  if (typeof value.value === "string") return value.value;
  const expression = value.type === "JSXExpressionContainer" ? value.expression : null;
  if (typeof expression?.value === "string") return expression.value;
  if (expression?.type !== "TemplateLiteral" || expression.expressions.length > 0) return null;
  const quasiValue = expression.quasis.length === 1 ? expression.quasis[0]?.value : null;
  return typeof quasiValue?.cooked === "string" ? quasiValue.cooked : (quasiValue?.raw ?? null);
}
function jsxOpenings(program) {
  const openings = [];
  walk(program, (node) => {
    if (node.type === "JSXOpeningElement") openings.push(node);
  });
  return openings;
}
module.exports = {
  importDeclarations,
  importedNames,
  jsxAttribute,
  jsxAttributeString,
  jsxName,
  jsxOpenings,
  parseOwned,
  positionOf,
  relative,
  sourceValue,
  moduleReferences,
  toPosix,
  walk,
};

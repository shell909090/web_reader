import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const MI_MINIMUM = 30;
const BRANCH_KINDS = new Set([
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.WhileStatement,
]);
const OPERAND_KINDS = new Set([
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.TrueKeyword,
]);
const IGNORED_TOKENS = new Set([
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.EndOfFileToken,
  ts.SyntaxKind.OpenBraceToken,
  ts.SyntaxKind.OpenBracketToken,
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.SemicolonToken,
]);

function cyclomaticComplexity(sourceFile) {
  let complexity = 1;
  function visit(node) {
    if (BRANCH_KINDS.has(node.kind)) complexity += 1;
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    )
      complexity += 1;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return complexity;
}

function halsteadVolume(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
  );
  const operators = [];
  const operands = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (IGNORED_TOKENS.has(kind)) continue;
    const target = OPERAND_KINDS.has(kind) ? operands : operators;
    target.push(`${kind}:${scanner.getTokenText()}`);
  }
  const vocabulary = new Set([...operators, ...operands]).size;
  const length = operators.length + operands.length;
  return vocabulary > 1 ? length * Math.log2(vocabulary) : 1;
}

export function maintainabilityIndex(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = Math.max(1, source.split(/\r?\n/u).filter((line) => line.trim().length > 0).length);
  const volume = Math.max(1, halsteadVolume(source));
  const complexity = cyclomaticComplexity(sourceFile);
  const raw = 171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(lines);
  return Math.max(0, (raw * 100) / 171);
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = ['lib.ts', 'read.ts', ...(await sourceFiles('plugins'))].sort();
  let failed = false;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const index = maintainabilityIndex(source, file);
    console.log(`${file}: MI ${index.toFixed(2)}`);
    if (index <= MI_MINIMUM) failed = true;
  }
  if (failed) {
    console.error(`Maintainability Index must be greater than ${MI_MINIMUM}`);
    process.exitCode = 1;
  }
}

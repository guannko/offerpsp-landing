import fs from 'node:fs';
import path from 'node:path';

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error('Usage: node generate-private-restore.mjs <private-recovery-root>');
const root = path.resolve(rootArg);
const dataFile = path.join(root, 'supabase/data/table-data.json');
const tables = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const output = [
  '-- GENERATED PRIVATE DISASTER-RECOVERY DATA SNAPSHOT.',
  '-- Apply only to an empty database after all captured migrations.',
  '-- Review auth identity remapping and Storage restoration before opening traffic.',
  'begin;',
  "set local session_replication_role = 'replica';",
];

for (const table of tables) {
  if (!table.rows?.length) continue;
  const [schema, name] = table.key.split('.', 2);
  const tag = `$bix_${schema}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}$`;
  const json = JSON.stringify(table.rows);
  output.push(
    `-- ${table.key}: ${table.rows.length} row(s)`,
    `insert into ${quoteIdentifier(schema)}.${quoteIdentifier(name)}`,
    `select * from jsonb_populate_recordset(null::${quoteIdentifier(schema)}.${quoteIdentifier(name)}, ${tag}${json}${tag}::jsonb);`,
  );
}

output.push("set local session_replication_role = 'origin';", 'commit;', '');
const target = path.join(root, 'supabase/data/restore-data.sql');
fs.writeFileSync(target, output.join('\n'), { mode: 0o600 });
console.log(`Generated ${path.relative(process.cwd(), target)}.`);

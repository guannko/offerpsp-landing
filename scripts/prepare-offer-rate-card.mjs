#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseCliArgs, parseOfferSource } from "../platform-v2/api/_lib/offer-parser.mjs";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const sourcePath = resolve(args.source);
  const outputPath = resolve(args.output);
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceMetadata = args["source-metadata"]
    ? JSON.parse(await readFile(resolve(args["source-metadata"]), "utf8"))
    : {};
  const sourceReference = args.reference || basename(sourcePath);
  const payload = parseOfferSource({
    providerKey: args.provider,
    providerName: args["provider-name"],
    providerWebsite: args["provider-website"],
    strategicPriority: args["strategic-priority"],
    marginIncluded: args["margin-included"],
    effectiveDate: args["effective-date"],
    sourceText,
    sourceType: args["source-type"] || "telegram",
    sourceReference,
    sourceFormat: args["source-format"],
    originalSource: args["original-source"] || sourceReference,
    extractionMethod: args["extraction-method"] || "plain-text",
    extractorVersion: args["extractor-version"],
    sourceMetadata,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    provider: payload.provider.brand_name,
    routes: payload.batch.routes.length,
    blockingAnomalies: payload.batch.parser_metadata.blocking_anomaly_count,
    publicationAllowed: false,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

# SiteOne Crawler runtime

- Version: `2.5.1.20260627`
- Upstream: `https://github.com/janreges/siteone-crawler/releases/tag/v2.5.1`
- Assets:
  - `siteone-crawler-v2.5.1-linux-musl-arm64.tar.gz` — `cad85649c09a4181ae36e47269caff647fe7e2bb556dc388b5f7aede6e420e20`
  - `siteone-crawler-v2.5.1-linux-musl-x64.tar.gz` — `bd96b9502563aea2581fc248625871e69b60d7f1bb68a484f226c551c73706fd`
- Vendored binaries:
  - `siteone-crawler-arm64` — `eb67cf340a0d52c0fc01484c11545c66266e32e82c7a35954a4211b70af7e274`
  - `siteone-crawler-x64` — `4b0b40d99ec3911f330222c666018dc2bb29bea7368fd7100e2cd9f56ab8e15b`

Both official statically linked Linux binaries are bundled only with the server-side Vercel function. The runner selects the
binary from `process.arch`, because Vercel can execute a function on either x64 or ARM64 infrastructure. The binaries are never
served to the browser. The upstream MIT license is stored next to them.

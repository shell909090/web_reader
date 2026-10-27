import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Verify that Trivy scanned every locked dependency, including development packages. */
export function summarizeSecurity(report, lock) {
  if (!Array.isArray(report.Results)) throw new Error('Missing Trivy package results');
  const result = report.Results.find(
    (item) => item.Type === 'npm' && item.Target === 'package-lock.json',
  );
  if (!result?.Packages?.length) throw new Error('Missing scanned packages: package-lock.json');
  if (!lock.packages || Object.keys(lock.packages).length <= 1) {
    throw new Error('Missing lockfile packages');
  }
  const scanned = new Set(result.Packages.map((pkg) => `${pkg.Name}@${pkg.Version}`));
  for (const [location, dependency] of Object.entries(lock.packages)) {
    if (!location) continue;
    const name = dependency.name ?? location.split('node_modules/').at(-1);
    if (!scanned.has(`${name}@${dependency.version}`)) {
      throw new Error(`Dependency absent from scan: ${name}@${dependency.version}`);
    }
  }
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  const vulnerabilities = report.Results.flatMap((item) => item.Vulnerabilities ?? []);
  for (const vulnerability of vulnerabilities) {
    const severity = vulnerability.Severity ?? 'UNKNOWN';
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return { packages: result.Packages.length, vulnerabilities, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const summary = summarizeSecurity(report, lock);
    console.log(`Scanned npm packages: ${summary.packages}`);
    for (const v of summary.vulnerabilities) {
      console.log(`${v.Severity} ${v.VulnerabilityID} ${v.PkgName}@${v.InstalledVersion}`);
    }
    console.log(`Vulnerabilities: ${JSON.stringify(summary.counts)}`);
  } catch (error) {
    console.error(`Security scan coverage failed: ${error.message}`);
    process.exitCode = 1;
  }
}

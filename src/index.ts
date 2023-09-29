import * as fs from 'node:fs';
import * as stream from 'node:stream';
import * as os from 'node:os';
import {getInput} from '@actions/core';
import got from 'got';
import tar from 'tar';
import which from 'which';

interface Params {
  version: string | null;
  channel: string | null;
}

const params: Params = {
  version: getInput('version'),
  channel: getInput('channel') || 'stable',
};

// Detect architecture
const architectureMapping: Record<string, string> = {
  x86_64: 'x86_64',
  x64: 'x86_64',
  amd64: 'x86_64',
  arm64: 'arm64',
  aarch64: 'arm64',
  i386: 'i386',
};
const architecture = architectureMapping[os.machine()];
process.stdout.write(`Architecture: ${os.machine()} (${architecture || 'unsupported'})\n`);
if (!architecture) {
  throw new Error('We do not support this architecture yet.');
}

// Detect OS
const systemMapping: Record<string, string> = {
  Linux: 'Linux',
  Darwin: 'Darwin',
  Windows: 'Windows',
  Windows_NT: 'Windows',
};
const system = systemMapping[os.type()];
process.stdout.write(`System: ${os.type()} (${system || 'unsupported'})\n`);
if (!system) {
  throw new Error('We do not support this OS yet.');
}

// Detect binaries path
// TODO: Consider installing Testkube in some random place, and add it to PATH environment variable
const detectedPaths = (process.env.PATH || '').split(':').filter(Boolean).sort((a, b) => a.length - b.length);
const writablePaths = (await Promise.all(detectedPaths.map(async dirPath => ({path: dirPath, writable: await fs.promises.access(dirPath, fs.constants.W_OK).then(() => true).catch(() => false)})))).filter(x => x.writable).map(x => x.path);
const preferredPaths = ['/usr/local/bin', '/usr/bin'];
const binaryDirPath = preferredPaths.find(x => writablePaths.includes(x)) || writablePaths[0];
process.stdout.write(`Binary path: ${binaryDirPath || '<none>'}\n`);
if (!binaryDirPath) {
  throw new Error('Could not find a writable path that is exposed in PATH to put the binary.');
}

// Detect if there is kubectl installed
const hasKubectl = await which('kubectl', {nothrow: true});
process.stdout.write(`kubectl: ${hasKubectl ? 'detected' : 'not available'}.\n`);
if (!hasKubectl) {
  throw new Error('You do not have kubectl installed. Most likely you need to configure your workflow to initialize connection with Kubernetes cluster.');
}

// Detect if there is Testkube CLI already installed
if (await which('kubectl-testkube', {nothrow: true})) {
  process.stdout.write('Looks like you already have the Testkube CLI installed. Skipping...');
  process.exit(0);
}

// Detect the latest version
if (params.version) {
  params.version = params.version.replace(/^v/, '');
  process.stdout.write(`Forcing "${params.version} version...\n`);
} else {
  process.stdout.write(`Detecting the latest version for minimum of "${params.channel}" channel...\n`);
  if (params.channel === 'stable') {
    const release: any = await got('https://api.github.com/repos/kubeshop/testkube/releases/latest').json();
    params.version = release?.tag_name;
  } else {
    const channels = ['stable', params.channel];
    process.stdout.write(`Detecting the latest version for minimum of "${params.channel}" channel...\n`);

    const releases: any[] = await got('https://api.github.com/repos/kubeshop/testkube/releases').json();
    const versions = releases.map(release => ({
      tag: release.tag_name,
      channel: release.tag_name.match(/-([^0-9]+)/)?.[1] || 'stable',
    }));
    params.version = versions.find(({channel}) => channels.includes(channel))?.tag;
  }
  if (!params.version) {
    throw new Error('Not found any version matching criteria.');
  }
  params.version = params.version.replace(/^v/, '');
  process.stdout.write(`   Latest version: ${params.version}\n`);
}

const artifactUrl = `https://github.com/kubeshop/testkube/releases/download/v${encodeURIComponent(params.version)}/testkube_${encodeURIComponent(params.version)}_${encodeURIComponent(system)}_${encodeURIComponent(architecture)}.tar.gz`;
process.stdout.write(`Downloading the artifact from "${artifactUrl}"...\n`);

const artifactStream = got.stream(artifactUrl).pipe(tar.x({C: binaryDirPath}, ['kubectl-testkube']));

await stream.promises.finished(artifactStream);

process.stdout.write(`Extracted CLI to ${binaryDirPath}/kubectl-testkube.\n`);

await fs.promises.symlink(`${binaryDirPath}/kubectl-testkube`, `${binaryDirPath}/testkube`);
process.stdout.write(`Linked CLI as ${binaryDirPath}/testkube.\n`);

await fs.promises.symlink(`${binaryDirPath}/kubectl-testkube`, `${binaryDirPath}/tk`);
process.stdout.write(`Linked CLI as ${binaryDirPath}/tk.\n`);

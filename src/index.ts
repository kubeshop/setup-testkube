import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as toolCache from "@actions/tool-cache";
import { getInput, addPath } from "@actions/core";
import got from "got";
import which from "which";

interface Params {
  version?: string | null;
  channel: string;
  namespace?: string | null;
  url: string;
  urlApiSubdomain?: string | null;
  urlUiSubdomain?: string | null;
  urlLogsSubdomain?: string | null;
  organization?: string | null;
  environment?: string | null;
  token?: string | null;
}

const params: Params = {
  version: getInput("version"),
  channel: getInput("channel") || "stable",
  namespace: getInput("namespace") || "testkube",
  url: getInput("url") || "testkube.io",
  urlApiSubdomain: getInput("urlApiSubdomain"),
  urlUiSubdomain: getInput("urlUiSubdomain"),
  urlLogsSubdomain: getInput("urlLogsSubdomain"),
  organization: getInput("organization"),
  environment: getInput("environment"),
  token: getInput("token"),
};

const mode = params.organization || params.environment || params.token ? "cloud" : "kubectl";
if (mode === "cloud") {
  process.stdout.write(`Detected mode: cloud connection.\n`);
} else {
  process.stdout.write(
    `Detected mode: kubectl connection. To use Cloud connection instead, provide your 'organization', 'environment' and 'token'.\n`
  );
}

// Check params
if (mode === "cloud") {
  if (!params.organization || !params.environment || !params.token) {
    throw new Error("You need to pass `organization`, `environment` and `token` for Cloud connection.");
  }
}

// Detect architecture
const architectureMapping: Record<string, string> = {
  x86_64: "x86_64",
  x64: "x86_64",
  amd64: "x86_64",
  arm64: "arm64",
  aarch64: "arm64",
  i386: "i386",
};
const architecture = architectureMapping[os.machine()];
process.stdout.write(`Architecture: ${os.machine()} (${architecture || "unsupported"})\n`);
if (!architecture) {
  throw new Error("We do not support this architecture yet.");
}

// Detect OS
const systemMapping: Record<string, string> = {
  Linux: "Linux",
  Darwin: "Darwin",
  Windows: "Windows",
  Windows_NT: "Windows",
};
const system = systemMapping[os.type()];
process.stdout.write(`System: ${os.type()} (${system || "unsupported"})\n`);
if (!system) {
  throw new Error("We do not support this OS yet.");
}

// Detect binaries path
// TODO: Consider installing Testkube in some random place, and add it to PATH environment variable
const detectedPaths = (process.env.PATH || "")
  .split(":")
  .filter(Boolean)
  .sort((a, b) => a.length - b.length);
const writablePaths = (
  await Promise.all(
    detectedPaths.map(async (dirPath) => ({
      path: dirPath,
      writable: await fs.promises
        .access(dirPath, fs.constants.W_OK)
        .then(() => true)
        .catch(() => false),
    }))
  )
)
  .filter((x) => x.writable)
  .map((x) => x.path);
const preferredPaths = ["/usr/local/bin", "/usr/bin"];
const binaryDirPath = preferredPaths.find((x) => writablePaths.includes(x)) || writablePaths[0];
process.stdout.write(`Binary path: ${binaryDirPath || "<none>"}\n`);
if (!binaryDirPath) {
  throw new Error("Could not find a writable path that is exposed in PATH to put the binary.");
}

// Detect if there is kubectl installed
if (mode === "kubectl") {
  const hasKubectl = await which("kubectl", { nothrow: true });
  process.stdout.write(`kubectl: ${hasKubectl ? "detected" : "not available"}.\n`);
  if (!hasKubectl) {
    throw new Error(
      "You do not have kubectl installed. Most likely you need to configure your workflow to initialize connection with Kubernetes cluster."
    );
  }
} else {
  process.stdout.write("kubectl: ignored for Cloud integration\n");
}

const existingTestkubePath = params.version ? toolCache.find("kubectl-testkube", params.version) : "";
// if params.version is not specified, we will try to detect if there is any version installed
const isUnknowmTestkubeInstalled = !params.version && Boolean(await which("kubectl-testkube", { nothrow: true }));
const isTestkubeInstalled = existingTestkubePath.length > 0 || isUnknowmTestkubeInstalled;

if (isTestkubeInstalled) {
  if (existingTestkubePath) addPath(existingTestkubePath);
  process.stdout.write("Looks like you already have the Testkube CLI installed. Skipping...\n");
} else {
  // Detect the latest version
  if (params.version) {
    params.version = params.version.replace(/^v/, "");
    process.stdout.write(`Forcing "${params.version} version...\n`);
  } else {
    process.stdout.write(`Detecting the latest version for minimum of "${params.channel}" channel...\n`);
    if (params.channel === "stable") {
      const release: any = await got("https://api.github.com/repos/kubeshop/testkube/releases/latest").json();
      params.version = release?.tag_name;
    } else {
      const channels = ["stable", params.channel];
      process.stdout.write(`Detecting the latest version for minimum of "${params.channel}" channel...\n`);

      const releases: any[] = await got("https://api.github.com/repos/kubeshop/testkube/releases").json();
      const versions = releases.map((release) => ({
        tag: release.tag_name,
        channel: release.tag_name.match(/-([^0-9]+)/)?.[1] || "stable",
      }));
      params.version = versions.find(({ channel }) => channels.includes(channel))?.tag;
    }
    if (!params.version) {
      throw new Error("Not found any version matching criteria.");
    }
    params.version = params.version.replace(/^v/, "");
    process.stdout.write(`   Latest version: ${params.version}\n`);
  }

  const encodedVersion = encodeURIComponent(params.version);
  const encodedVerSysArch = `${encodeURIComponent(params.version)}_${encodeURIComponent(system)}_${encodeURIComponent(
    architecture
  )}`;

  const artifactUrl = `https://github.com/kubeshop/testkube/releases/download/v${encodedVersion}/testkube_${encodedVerSysArch}.tar.gz`;

  if (!isTestkubeInstalled) {
    process.stdout.write(`Downloading the artifact from "${artifactUrl}"...\n`);
    const artifactPath = await toolCache.downloadTool(artifactUrl);
    if (fs.existsSync(`${binaryDirPath}/kubectl-testkube`)) {
      fs.rmSync(`${binaryDirPath}/kubectl-testkube`);
    }
    const artifactExtractedPath = await toolCache.extractTar(artifactPath, binaryDirPath);
    const cachedDir = await toolCache.cacheFile(path.join(artifactExtractedPath, 'kubectl-testkube'), 'kubectl-testkube', 'kubectl-testkube', params.version);
    addPath(cachedDir);
  }

  process.stdout.write(`Linking CLI...\n`);

  const testkubePath =
    existingTestkubePath.length > 0 ? `${existingTestkubePath}/kubectl-testkube` : `${binaryDirPath}/kubectl-testkube`;

  if (fs.existsSync(`${binaryDirPath}/testkube`)) {
    fs.rmSync(`${binaryDirPath}/testkube`);
  }
  await fs.promises.symlink(`${testkubePath}`, `${binaryDirPath}/testkube`);
  process.stdout.write(`Linked CLI as ${binaryDirPath}/testkube.\n`);

  if (fs.existsSync(`${binaryDirPath}/tk`)) {
    fs.rmSync(`${binaryDirPath}/tk`);
  }
  await fs.promises.symlink(`${testkubePath}`, `${binaryDirPath}/tk`);
  process.stdout.write(`Linked CLI as ${binaryDirPath}/tk.\n`);
}

// Configure the Testkube context
const contextArgs =
  mode === "kubectl"
    ? ["--kubeconfig", "--namespace", params.namespace!]
    : [
        "--api-key",
        params.token!,
        "--root-domain",
        params.url!,
        "--org-id",
        params.organization!,
        "--env-id",
        params.environment!,
        ...(params.urlApiSubdomain ? ["--api-prefix", params.urlApiSubdomain] : []),
        ...(params.urlUiSubdomain ? ["--ui-prefix", params.urlUiSubdomain] : []),
        ...(params.urlLogsSubdomain ? ["--logs-prefix", params.urlLogsSubdomain] : []),
      ];

process.exit(spawnSync("testkube", ["set", "context", ...contextArgs], { stdio: "inherit" }).status || 0);

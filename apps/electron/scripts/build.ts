import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenvFlow from "dotenv-flow";
import { type Configuration, build } from "electron-builder";
import {
  APP_PRODUCT_NAME,
  APP_BUILD_VERSION,
  toWindowsFileVersion,
} from "@mediago/shared-common";

const args = process.argv.slice(2);
const isDir = args.includes("--dir");
const isBeta = args.includes("--beta");
if (isBeta && !isDir) throw new Error("Local beta packaging requires --dir");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const appRoot = path.resolve(__dirname, "..");
const arch = process.arch === "arm64" ? "arm64" : "x64";
// A single temporary build directory; product history belongs in reports/rollback.
const betaOutputDir = isBeta ? "./release-beta" : "./release";

dotenvFlow.config({
  path: projectRoot,
});

const pkg = JSON.parse(await fs.readFile("./app/package.json", "utf-8"));
const platformCatalog = JSON.parse(
  await fs.readFile(
    path.join(
      projectRoot,
      "apps/ui/src/pages/platforms-page/engine-catalog.generated.json",
    ),
    "utf8",
  ),
);

function getReleaseConfig(): Configuration {
  return {
    asar: true,
    asarUnpack: [],
    productName: APP_PRODUCT_NAME,
    buildVersion: APP_BUILD_VERSION,
    extraMetadata: {
      name: "nyacatch",
      version: APP_BUILD_VERSION,
      author: "kuroii07",
      homepage: "https://github.com/kuroii07/NyaCatch",
    },
    appId: "io.github.kuroii07.nyacatch",
    copyright: process.env.APP_COPYRIGHT,
    // Register the custom scheme at install/first-run time.
    // • macOS: electron-builder merges this into CFBundleURLTypes.
    // • Windows: runtime `app.setAsDefaultProtocolClient` in src/index.ts
    //   handles registry entries on first launch — electron-builder
    //   doesn't write these directly.
    // • Linux: runtime handler writes the .desktop file at first launch.
    protocols: [],
    artifactName: "${productName}-${buildVersion}-windows-${arch}-setup.${ext}",
    npmRebuild: false,
    directories: {
      output: isBeta ? betaOutputDir : "./release",
    },
    files: [
      "./runtime_modules/**",
      {
        from: "./build/main",
        to: "./main",
      },
      {
        from: "./build/renderer",
        to: "./renderer",
      },
      {
        from: "./build/preload",
        to: "./preload",
      },
      "./package.json",
      "!**/node_modules/**",
      "**/node_modules/@mediago/electron-preload/**",
      "**/node_modules/@mediago/browser-extension/**",
      "**/node_modules/@ghostery/adblocker-electron-preload/**",
    ],
    extraResources: [
      { from: "./app/build/nyacatch-beta.json", to: "nyacatch-beta.json" },
      { from: path.join(projectRoot, "licenses"), to: "licenses" },
      {
        from: "./app/build/plugin",
        to: "plugin",
      },
      {
        from: "./app/build/bin",
        to: "bin",
      },
      {
        from: "./app/build/deps",
        to: "deps",
      },
      {
        // MediaGo browser extension (Manifest V3). Shipped unpacked
        // inside the installer's `resources/extension/` so users can
        // "Load unpacked" it from Chrome / Edge via the Settings page's
        // "Browser extension directory" button. The runtime path is
        // resolved by `resolveExtensionDir()` in binaryResolver.ts.
        from: "./app/build/extension",
        to: "extension",
      },
    ],
    win: {
      // Branding is applied below with the native rcedit binary for a local
      // beta, avoiding winCodeSign's unrelated macOS symlink extraction.
      signAndEditExecutable: false,
      icon: "./assets/icon.ico",
      target: [
        {
          target: "nsis",
          arch,
        },
      ],
    },
    portable: {
      artifactName:
        "${productName}-portable-${platform}-${arch}-${buildVersion}.${ext}",
    },
    dmg: {
      contents: [
        {
          x: 410,
          y: 150,
          type: "link",
          path: "/Applications",
        },
        {
          x: 130,
          y: 150,
          type: "file",
        },
      ],
    },
    mac: {
      icon: "../assets/icon.icns",
      identity: null,
      target: [
        {
          target: "dmg",
          arch,
        },
      ],
      extendInfo: {
        CFBundleURLTypes: [
          {
            CFBundleURLName: "MediaGo URL Scheme",
            // Must match `process.env.APP_NAME` in .env — the same
            // scheme used by src/index.ts's setAsDefaultProtocolClient
            // and by the browser extension's MEDIAGO_SCHEME.
            CFBundleURLSchemes: [process.env.APP_NAME as string],
          },
        ],
      },
    },
    linux: {
      category: "Utility",
      icon: "../assets/icon.icns",
      maintainer: "caorushizi <84996057@qq.com>",
      target: {
        target: "deb",
        arch,
      },
    },
    nsis: {
      oneClick: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      runAfterFinish: false,
      deleteAppDataOnUninstall: false,
    },
  };
}

const electronTask = [
  {
    src: "apps/electron/build",
    dest: "app/build/main",
  },
  {
    src: "apps/ui/build/electron",
    dest: "app/build/renderer",
  },
  {
    src: "packages/electron-preload/build",
    dest: "app/build/preload",
  },
  {
    src: "packages/browser-extension/build",
    dest: "app/build/plugin",
  },
  {
    // MediaGo browser extension dist — produced upstream by
    // `turbo run build -F @mediago/extension` (wired into
    // `pnpm build:electron` at the repo root). Gets zipped into the
    // installer via the `extraResources` entry above.
    src: "packages/mediago-extension/dist",
    dest: "app/build/extension",
  },
];

for (const task of electronTask) {
  await fs.cp(
    path.resolve(projectRoot, task.src),
    path.resolve(appRoot, task.dest),
    {
      recursive: true,
      force: true,
    },
  );
}

{
  // Main-process code is bundled, but these preloads are resolved at runtime.
  for (const name of [
    "@mediago/electron-preload",
    "@mediago/browser-extension",
    "@ghostery/adblocker-electron-preload",
  ]) {
    const from = path.join(appRoot, "node_modules", name);
    const to = path.join(appRoot, "app/runtime_modules/node_modules", name);
    await fs.mkdir(to, { recursive: true });
    await fs.copyFile(
      path.join(from, "package.json"),
      path.join(to, "package.json"),
    );
    for (const dir of ["build", "dist"]) {
      try {
        await fs.cp(path.join(from, dir), path.join(to, dir), {
          recursive: true,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

// Copy Go binaries to app/build/bin/ and app/build/deps/ for extraResources
const isWindows = os.platform() === "win32";
const ext = isWindows ? ".exe" : "";
const binDir = path.resolve(appRoot, "app/build/bin");
const depsDir = path.resolve(appRoot, "app/build/deps");

await fs.mkdir(binDir, { recursive: true });
await fs.mkdir(depsDir, { recursive: true });

// Copy mediago-core binary + config
await fs.copyFile(
  process.env.MEDIAGO_PACKAGE_CORE ||
    path.resolve(projectRoot, `apps/core/bin/mediago-core${ext}`),
  path.join(binDir, `mediago-core${ext}`),
);
// The Go core has embedded defaults; copy an explicit schema only if supplied.
const schema = path.resolve(projectRoot, "apps/core/configs/config.json");
try {
  await fs.copyFile(schema, path.join(binDir, "config.json"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
{
  const versions = JSON.parse(
    await fs.readFile(
      path.resolve(projectRoot, "scripts/deps-versions.json"),
      "utf8",
    ),
  ) as Record<string, { version?: string }>;
  const bundledTools = Object.fromEntries(
    ["yt-dlp", "ffmpeg", "ffprobe", "BBDown", "N_m3u8DL-RE"].flatMap((name) => {
      const version = versions[name]?.version;
      return version ? [[name, version]] : [];
    }),
  );
  await fs.writeFile(
    path.join(appRoot, "app/build/nyacatch-beta.json"),
    JSON.stringify({
      product: APP_PRODUCT_NAME,
      channel: APP_BUILD_VERSION.includes("-") ? "local-beta" : "stable",
      version: APP_BUILD_VERSION,
      upstreamVersion: pkg.version,
      bundledTools,
      platformCatalog: platformCatalog
        ? {
            version: platformCatalog.version,
            entries: platformCatalog.extractors.length,
            binarySha256: platformCatalog.binarySha256,
          }
        : undefined,
    }),
  );
}

// Copy dependency binaries (ffmpeg, N_m3u8DL-RE, BBDown, aria2c, yt-dlp)
const platformKey = `${os.platform()}-${os.arch()}`;
const localDepsDir = path.resolve(projectRoot, ".deps", platformKey);
try {
  await fs.cp(localDepsDir, depsDir, { recursive: true, force: true });
  await fs.cp(
    path.join(projectRoot, "apps/core/plugins"),
    path.join(depsDir, "plugins"),
    { recursive: true, force: true },
  );
} catch {
  throw new Error(
    `Required dependency directory .deps/${platformKey} could not be copied`,
  );
}

if (platformCatalog) {
  const binary = path.join(depsDir, isWindows ? "yt-dlp.exe" : "yt-dlp");
  const sha256 = createHash("sha256")
    .update(await fs.readFile(binary))
    .digest("hex");
  if (
    sha256 !== platformCatalog.binarySha256 ||
    !platformCatalog.extractors.length
  ) {
    throw new Error(
      "Platform catalog does not match the bundled downloader; regenerate the catalog and rebuild the UI",
    );
  }
}

const config = getReleaseConfig();
{
  config.files = [
    ...(config.files || []).filter((entry) => entry !== "./runtime_modules/**"),
    { from: "runtime_modules/node_modules", to: "node_modules" },
  ];
}
config.publish = {
  provider: "github",
  owner: "kuroii07",
  repo: "NyaCatch",
  releaseType: "draft",
};
config.afterPack = async (context) => {
  if (isWindows)
    await brandWindowsExecutable(
      path.join(context.appOutDir, `${APP_PRODUCT_NAME}.exe`),
    );
};
await build({
  config,
  dir: isDir,
  publish: "never",
  // targets: Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64),
});

async function brandWindowsExecutable(executable: string) {
  let editor = process.env.NYACATCH_RCEDIT;
  if (!editor) {
    const cache = path.join(
      process.env.LOCALAPPDATA || "",
      "electron-builder/Cache/winCodeSign",
    );
    for (const entry of await fs.readdir(cache, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(cache, entry.name, `rcedit-${arch}.exe`);
      try {
        await fs.access(candidate);
        editor = candidate;
        break;
      } catch {
        /* This cache entry may contain a different tool. */
      }
    }
  }
  if (!editor)
    throw new Error(
      "Set NYACATCH_RCEDIT to a native rcedit executable for beta PE branding",
    );
  // The cached rcedit can reject the resource layout written by builder's
  // ASAR-integrity step. A native no-op commit normalizes it while retaining
  // every resource. This is applied only to the newly built, unsigned beta.
  const normalizeResources = () =>
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NyaCatchResourceEditor {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool EndUpdateResource(IntPtr handle, bool discard);
}
'@
$resourceHandle = [NyaCatchResourceEditor]::BeginUpdateResource($env:NYACATCH_PE_TARGET, $false)
if ($resourceHandle -eq [IntPtr]::Zero) { throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
if (-not [NyaCatchResourceEditor]::EndUpdateResource($resourceHandle, $false)) { throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
`,
      ],
      {
        windowsHide: true,
        env: { ...process.env, NYACATCH_PE_TARGET: executable },
      },
    );
  const brandExecutable = () =>
    execFileSync(
      editor,
      [
        executable,
        "--set-icon",
        path.join(appRoot, "assets/icon.ico"),
        "--set-file-version",
        toWindowsFileVersion(APP_BUILD_VERSION),
        "--set-product-version",
        toWindowsFileVersion(APP_BUILD_VERSION),
        "--set-version-string",
        "ProductVersion",
        APP_BUILD_VERSION,
        "--set-version-string",
        "ProductName",
        APP_PRODUCT_NAME,
        "--set-version-string",
        "FileDescription",
        "NyaCatch · 喵拾",
        "--set-version-string",
        "OriginalFilename",
        `${APP_PRODUCT_NAME}.exe`,
      ],
      { windowsHide: true },
    );
  // Each commit rewrites the executable and can briefly reject another edit
  // (Win32 5/110). Finish normalization once, then retry branding independently.
  for (const [phase, edit] of [
    ["normalization", normalizeResources],
    ["branding", brandExecutable],
  ] as const) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        edit();
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        console.warn(`Windows resource ${phase} retry ${attempt + 1}/5`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  const actualVersion = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$v = (Get-Item -LiteralPath $env:NYACATCH_PE_TARGET).VersionInfo; @{file=$v.FileVersion;product=$v.ProductVersion;name=$v.ProductName} | ConvertTo-Json -Compress",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, NYACATCH_PE_TARGET: executable },
      },
    ),
  );
  if (
    actualVersion.file !== toWindowsFileVersion(APP_BUILD_VERSION) ||
    actualVersion.product !== APP_BUILD_VERSION ||
    actualVersion.name !== APP_PRODUCT_NAME
  ) {
    throw new Error(
      `Packaged Windows version mismatch: ${JSON.stringify(actualVersion)}`,
    );
  }
}

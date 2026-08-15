export const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

const RELEASES_URL =
  'https://api.github.com/repos/y-bgmpst/spotify-music-quiz/releases/latest';

type GitHubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  name: string;
  published_at: string;
  assets: GitHubAsset[];
};

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
  assetName?: string;
  assetUrl?: string;
  assetSize?: number;
};

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = normalizeVersion(current).split('.').map(Number);
  const latestParts = normalizeVersion(latest).split('.').map(Number);
  const length = Math.max(currentParts.length, latestParts.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = Number.isFinite(currentParts[index]) ? (currentParts[index] as number) : 0;
    const latestPart = Number.isFinite(latestParts[index]) ? (latestParts[index] as number) : 0;
    if (latestPart !== currentPart) return latestPart > currentPart;
  }
  return false;
}

export function getPlatformAsset(
  assets: GitHubAsset[],
): GitHubAsset | undefined {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes('win')) {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.zip'));
  }
  if (platform.includes('linux')) {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.tar.gz'));
  }
  return undefined;
}

export async function checkForUpdate(
  signal?: AbortSignal,
): Promise<UpdateInfo | null> {
  const response = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  if (!response.ok)
    throw new Error(`GitHub update check failed (${response.status})`);

  const release = (await response.json()) as GitHubRelease;
  if (!isNewerVersion(CURRENT_VERSION, release.tag_name)) return null;

  const asset = getPlatformAsset(release.assets);
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: normalizeVersion(release.tag_name),
    releaseUrl: release.html_url,
    releaseName: release.name,
    publishedAt: release.published_at,
    assetName: asset?.name,
    assetUrl: asset?.browser_download_url,
    assetSize: asset?.size,
  };
}
